import { GoogleGenAI, Type } from "@google/genai";
import { RundownItem, ItemType, TeamRole } from "../types";
import * as XLSX from 'xlsx';

// Helper to convert file to base64
export const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result as string;
      // Remove the Data-URI prefix to get raw base64
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = error => reject(error);
  });
};

const readExcelToCSV = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsArrayBuffer(file);
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const csv = XLSX.utils.sheet_to_csv(worksheet);
        resolve(csv);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = (err) => reject(err);
  });
};

const normalizeType = (rawType?: string): ItemType => {
    if (!rawType) return ItemType.KEYNOTE;
    const upper = rawType.toUpperCase();
    
    if (upper.includes('VIDEO') || upper.includes('VÍDEO')) return ItemType.VIDEO;
    if (upper.includes('MUSIC') || upper.includes('MÚSICA') || upper.includes('LOUVOR') || upper.includes('BANDA')) return ItemType.MUSIC;
    if (upper.includes('PANEL') || upper.includes('PAINEL') || upper.includes('MESA') || upper.includes('DEBATE')) return ItemType.PANEL;
    if (upper.includes('BREAK') || upper.includes('INTERVALO') || upper.includes('CAFÉ') || upper.includes('COFFEE')) return ItemType.BREAK;
    
    return ItemType.KEYNOTE;
};

// Helper para converter strings de tempo (18:30, 18h30) em segundos do dia
const parseTimeRef = (str: string): number | null => {
    if (!str) return null;
    const clean = str.replace('h', ':').trim();
    const parts = clean.split(':');
    if (parts.length >= 2) {
        const h = parseInt(parts[0]);
        const m = parseInt(parts[1]);
        if (!isNaN(h) && !isNaN(m)) {
            return (h * 3600) + (m * 60);
        }
    }
    return null;
};

// Detecta se é pregação ou MC baseado no título/tipo
export const detectFlags = (title: string, type: string) => {
    const t = (title || "").toUpperCase();
    const tp = (type || "").toUpperCase();
    
    let isPreaching = false;
    let isMC = false;

    if (t.includes('PALAVRA') || t.includes('PREGAÇÃO') || t.includes('MENSAGEM') || t.includes('PRELETOR') || t.includes('MINISTRAÇÃO')) {
        isPreaching = true;
    }

    if (t.includes('ABERTURA') || t.includes('ENCERRAMENTO') || t.includes('AVISOS') || t.includes('BOAS VINDAS') || t.includes('MESTRE DE')) {
        isMC = true;
    }

    return { isPreaching, isMC };
};

// --- API KEY CHECK ---
const getClient = () => {
    const apiKey = process.env.API_KEY;
    if (!apiKey) {
        throw new Error("API KEY NÃO ENCONTRADA. Verifique as variáveis de ambiente no servidor de build/hospedagem.");
    }
    return new GoogleGenAI({ apiKey });
}

export interface AIImportResult {
    isMultiSession: boolean;
    items?: RundownItem[];
    sessions?: { name: string; date?: string; items: RundownItem[] }[];
}

export const parseRundownFromFile = async (file: File, singleSessionMode: boolean = false): Promise<AIImportResult> => {
  const ai = getClient();
  const mimeType = file.type;
  
  let contentPart: any;
  let textPromptAddon = "";

  if (mimeType === "application/pdf" || mimeType.startsWith("image/")) {
    const base64 = await fileToBase64(file);
    contentPart = { inlineData: { mimeType: mimeType, data: base64 } };
  } else if (mimeType.includes("sheet") || mimeType.includes("excel") || file.name.endsWith(".xlsx") || file.name.endsWith(".xls")) {
    const csvContent = await readExcelToCSV(file);
    contentPart = { text: `Here is the event rundown data in CSV format:\n${csvContent}` };
    textPromptAddon = "Parse the CSV data provided above.";
  } else {
    throw new Error("Formato de arquivo não suportado. Use PDF, Imagem ou Excel.");
  }

  let systemInstruction = `
    Você é um Diretor Técnico de Eventos (Show Caller) especializado em Cultos.
    Sua missão é extrair a escaleta do evento.
    
    PARA CADA ITEM:
    1. Extraia: Título, Palestrante e Tipo.
    2. DURAÇÃO: 
       - Tente encontrar a duração explícita.
       - Se houver colunas de "Horário" (ex: 18h00, 18h30), retorne o horário de início na string de duração ou nas notas, mas TENTE calcular a duração em segundos se possível.
       - Se não conseguir calcular, use padrão 300s (5 min).
    
    3. INSTRUÇÕES DE EQUIPE (teamNotes):
       - Identifique se há colunas ou textos com instruções para Som, Luz, Projeção, etc.
       - Se encontrar, retorne um objeto simples (chaves OBRIGATÓRIAS EM MAIÚSCULO: MESA DE SOM, ILUMINAÇÃO, PROJEÇÃO, TRANSMISSÃO, LOUVOR, DANÇA).
       - Se não encontrar, deixe vazio.

    IMPORTANTE:
    - O campo 'type' deve ser string livre.
    - Se não houver palestrante, deixe vazio.
  `;

  if (singleSessionMode) {
      systemInstruction += `
      MODO IMPORTAÇÃO SESSÃO ÚNICA (FORÇADO):
      - O usuário já está dentro de uma sessão específica.
      - IGNORE COMPLETAMENTE cabeçalhos de data, dia ou múltiplas sessões no arquivo.
      - Importe TODOS os itens listados no arquivo como uma ÚNICA lista sequencial plana para HOJE.
      - Defina 'isMultiSession': false.
      - Não crie array de 'sessions'. Use apenas 'items'.
      `;
  } else {
      systemInstruction += `
      MODO DETECÇÃO:
      - Verifique se há MÚLTIPLOS DIAS ou SESSÕES (ex: Sexta, Sábado Manhã).
      - Se sim, use 'sessions'. Se for um dia só, use 'items' e 'isMultiSession': false.
      `;
  }

  // Schema simplificado
  const itemSchema = {
    type: Type.OBJECT,
    properties: {
      title: { type: Type.STRING },
      speaker: { type: Type.STRING },
      timeStr: { type: Type.STRING, description: "Horário de início se houver (ex: 19:30)" },
      durationSeconds: { type: Type.INTEGER },
      type: { type: Type.STRING, description: "Tipo livre (Louvor, Palavra, Aviso...)" }, 
      notes: { type: Type.STRING },
      teamNotes: { type: Type.STRING, description: "JSON stringified object of team notes if found" }
    },
    required: ["title"]
  };

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: {
        parts: [
          contentPart,
          { text: `Extraia a escaleta. ${textPromptAddon} Responda apenas com o JSON.` }
        ]
      },
      config: {
        systemInstruction: systemInstruction,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            isMultiSession: { type: Type.BOOLEAN },
            items: { type: Type.ARRAY, items: itemSchema },
            sessions: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        name: { type: Type.STRING },
                        date: { type: Type.STRING },
                        items: { type: Type.ARRAY, items: itemSchema }
                    }
                }
            }
          }
        }
      }
    });

    const jsonText = response.text;
    if (!jsonText) throw new Error("A IA não retornou dados.");

    const parsedData = JSON.parse(jsonText);
    
    // Process items helper com cálculo de tempo e flags
    const processItems = (rawItems: any[]) => {
        const processed = rawItems.map((item: any) => {
            let parsedTeamNotes = {};
            try {
                if (item.teamNotes && typeof item.teamNotes === 'string') {
                    // Tenta limpar markdown se houver
                    const cleanJson = item.teamNotes.replace(/```json/g, '').replace(/```/g, '').trim();
                    parsedTeamNotes = JSON.parse(cleanJson);
                } else if (typeof item.teamNotes === 'object') {
                    parsedTeamNotes = item.teamNotes;
                }
            } catch (e) { console.warn("Failed to parse team notes JSON", e); }

            // Auto-detect flags
            const { isPreaching, isMC } = detectFlags(item.title || "", item.type || "");

            return {
                id: crypto.randomUUID(),
                title: item.title || "Sem Título",
                speaker: item.speaker || "",
                isPreaching,
                isMC,
                timeRef: parseTimeRef(item.timeStr), // Auxiliar para cálculo
                durationSeconds: item.durationSeconds || 0, // Se 0, vamos calcular abaixo
                type: normalizeType(item.type),
                notes: item.notes || "",
                teamNotes: parsedTeamNotes
            };
        });

        // Pós-processamento para calcular durações baseadas em horários sequenciais
        for (let i = 0; i < processed.length; i++) {
            if (processed[i].durationSeconds === 0 && processed[i].timeRef !== null) {
                // Tenta pegar o próximo horário
                if (i < processed.length - 1 && processed[i+1].timeRef !== null) {
                    const diff = processed[i+1].timeRef! - processed[i].timeRef!;
                    if (diff > 0) processed[i].durationSeconds = diff;
                    else processed[i].durationSeconds = 300; // Fallback
                } else {
                    processed[i].durationSeconds = 300; // Último item ou sem ref
                }
            } else if (processed[i].durationSeconds === 0) {
                processed[i].durationSeconds = 300; // Fallback padrão
            }
        }

        // Remover campos auxiliares
        return processed.map(({ timeRef, ...rest }: any) => rest);
    };

    if (parsedData.isMultiSession && parsedData.sessions && parsedData.sessions.length > 0) {
        return {
            isMultiSession: true,
            sessions: parsedData.sessions.map((s: any) => ({
                name: s.name || "Sessão",
                date: s.date || "",
                items: processItems(s.items || [])
            }))
        };
    } else {
        const itemsSource = parsedData.items || (parsedData.sessions?.[0]?.items) || [];
        return {
            isMultiSession: false,
            items: processItems(itemsSource)
        };
    }

  } catch (error: any) {
    console.error("Gemini Extraction Error:", error);
    if (error.message && error.message.includes("400")) {
        throw new Error("A IA teve dificuldade com o formato. Tente simplificar o arquivo.");
    }
    throw error;
  }
};

export const generateItemDetailsAI = async (title: string, speaker: string): Promise<{ teamNotes: Record<string, string> }> => {
  const ai = getClient();

  const systemInstruction = `
    Você é um Diretor Técnico de Cultos.
    Gere instruções técnicas CURTAS e DIRETAS (teamNotes) para os núcleos.
    Use as chaves exatas: MESA DE SOM, ILUMINAÇÃO, PROJEÇÃO, TRANSMISSÃO, LOUVOR, DANÇA.
    Exemplos:
    - Title: Louvor -> MESA DE SOM: "Liberar banda", ILUMINAÇÃO: "Cena Vibrante", PROJEÇÃO: "Letras e Motion"
    - Title: Pregação -> MESA DE SOM: "Mic Bastão", ILUMINAÇÃO: "Foco Orador", PROJEÇÃO: "Versículos"
    Retorne apenas JSON. Não use markdown.
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: {
        parts: [
            { text: `Item: ${title}\nDetalhes: ${speaker}\nRetorne um JSON com chaves em MAIÚSCULO.` }
        ]
      },
      config: {
        systemInstruction: systemInstruction,
        responseMimeType: "application/json",
      }
    });

    const jsonText = response.text;
    if (!jsonText) return { teamNotes: {} };
    
    // Clean Markdown json if present
    const cleanJson = jsonText.replace(/```json/g, '').replace(/```/g, '').trim();
    let parsed: any;
    
    try {
        parsed = JSON.parse(cleanJson);
    } catch (e) {
        console.error("Erro ao parsear resposta da IA individual:", e);
        return { teamNotes: {} };
    }

    // Normaliza para o formato esperado
    let finalNotes: Record<string, string> = {};
    
    if (parsed && !parsed.teamNotes) {
        const keys = Object.keys(parsed);
        if (keys.length > 0) {
             finalNotes = parsed;
        }
    } else if (parsed.teamNotes) {
        if (typeof parsed.teamNotes === 'string') {
             try { finalNotes = JSON.parse(parsed.teamNotes); } catch { finalNotes = {}; }
        } else {
             finalNotes = parsed.teamNotes;
        }
    }

    return { teamNotes: finalNotes };

  } catch (error) {
    console.error("Gemini AI Detail Generation Error:", error);
    return { teamNotes: {} };
  }
};

// --- FUNÇÃO DE PROCESSAMENTO EM MASSA (IA MÁGICA) ---
export const enrichRundownWithAI = async (items: RundownItem[]): Promise<Record<string, Record<string, string>>> => {
  if (items.length === 0) return {};
  const ai = getClient();
  
  const itemsSummary = items.map(i => ({
      id: i.id,
      title: i.title,
      speaker: i.speaker,
      type: i.type
  }));

  const systemInstruction = `
    Você é um Diretor Técnico de Igreja (Show Caller).
    Receba uma lista de itens do culto.
    Para CADA item, crie instruções técnicas (teamNotes) para os núcleos: MESA DE SOM, ILUMINAÇÃO, PROJEÇÃO, TRANSMISSÃO.
    
    REGRAS DE OURO:
    1. 'Louvor/Música': MESA DE SOM: "Banda Full", ILUMINAÇÃO: "Dinâmica", PROJEÇÃO: "Motion + Letra".
    2. 'Pregação/Palavra': MESA DE SOM: "Microfone Principal", ILUMINAÇÃO: "Foco Preletor", PROJEÇÃO: "IMAG/Versículos".
    3. 'Avisos': MESA DE SOM: "Mic Mão", ILUMINAÇÃO: "Palco Geral", PROJEÇÃO: "PPT Avisos".
    
    Retorne um Objeto JSON onde a CHAVE é o ID do item e o VALOR é o objeto de teamNotes.
    Responda APENAS o JSON limpo.
  `;

  try {
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: {
          parts: [{ text: JSON.stringify(itemsSummary) }]
        },
        config: {
            systemInstruction: systemInstruction,
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.OBJECT,
                description: "Map of ItemID to TeamNotes object",
                properties: {
                    updates: {
                        type: Type.ARRAY,
                        items: {
                            type: Type.OBJECT,
                            properties: {
                                id: { type: Type.STRING },
                                teamNotes: { type: Type.STRING, description: "JSON string of notes" }
                            }
                        }
                    }
                }
            }
        }
      });

      const jsonText = response.text;
      if (!jsonText) return {};

      const cleanJson = jsonText.replace(/```json/g, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleanJson);
      
      const resultMap: Record<string, Record<string, string>> = {};

      if (parsed.updates && Array.isArray(parsed.updates)) {
          parsed.updates.forEach((u: any) => {
              try {
                  let notes;
                  if (typeof u.teamNotes === 'string') {
                       notes = JSON.parse(u.teamNotes.replace(/```json/g, '').replace(/```/g, ''));
                  } else {
                       notes = u.teamNotes;
                  }
                  resultMap[u.id] = notes;
              } catch (e) {
                  if (typeof u.teamNotes === 'object') resultMap[u.id] = u.teamNotes;
              }
          });
      }

      return resultMap;

  } catch (error) {
      console.error("Bulk Enrich Error", error);
      throw error;
  }
};