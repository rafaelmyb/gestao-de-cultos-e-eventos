-- Dedicated database: event data is accessible only through the server API.
create table if not exists public.events (
  id text primary key,
  payload jsonb not null default '{}'::jsonb,
  revision bigint not null default 1,
  updated_at timestamptz not null default now()
);
alter table public.events enable row level security;
revoke all on public.events from anon, authenticated;
grant select, insert, update on public.events to service_role;

create or replace function public.save_event(p_id text, p_action text, p_payload jsonb)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare current_event public.events; next_payload jsonb; field text;
begin
  if p_action = 'create' then
    insert into public.events(id, payload) values (p_id, p_payload - 'serverOffset')
      on conflict (id) do nothing;
    select * into current_event from public.events where id = p_id;
  elsif p_action in ('update', 'overwrite') then
    select * into current_event from public.events where id = p_id for update;
    if not found then return null; end if;
    if p_action = 'overwrite' then
      next_payload := p_payload;
    else
      next_payload := current_event.payload || p_payload;
      foreach field in array array['roster', 'equipmentStatus', 'storedSessionItems'] loop
        if jsonb_typeof(p_payload->field) = 'object' then
          next_payload := jsonb_set(next_payload, array[field], coalesce(current_event.payload->field, '{}'::jsonb) || (p_payload->field));
        end if;
      end loop;
      if jsonb_typeof(p_payload->'roster'->'nucleos') = 'object' then
        next_payload := jsonb_set(next_payload, '{roster,nucleos}', coalesce(current_event.payload->'roster'->'nucleos', '{}'::jsonb) || (p_payload->'roster'->'nucleos'));
      end if;
    end if;
    update public.events set payload = next_payload - 'serverOffset', revision = revision + 1, updated_at = clock_timestamp()
      where id = p_id returning * into current_event;
  else
    raise exception 'Unsupported operation';
  end if;
  return jsonb_build_object('payload', current_event.payload, 'revision', current_event.revision);
end;
$$;
revoke all on function public.save_event(text, text, jsonb) from public, anon, authenticated;
grant execute on function public.save_event(text, text, jsonb) to service_role;
