
import React, { useEffect, useState, useRef } from 'react';
import { useEvent } from '../context/EventContext';
import { ItemStatus } from '../types';

interface TimerDisplayProps {
  size?: 'small' | 'medium' | 'large' | 'massive' | 'viewer';
  minimal?: boolean;
  showProgressBar?: boolean;
}

const TimerDisplay: React.FC<TimerDisplayProps> = ({ size = 'medium', minimal = false, showProgressBar = true }) => {
  const { status, targetEndTime, pausedAtTime, items, activeItemId, timerDirection } = useEvent();
  const [displayTime, setDisplayTime] = useState<string>("00:00");
  const [timerState, setTimerState] = useState<'normal' | 'warning' | 'critical'>('normal');
  const [remainingPercent, setRemainingPercent] = useState(100); // 100% (full time left) to 0% (no time left)
  const requestRef = useRef<number | null>(null);

  const activeItem = items.find(i => i.id === activeItemId);

  const calculate = () => {
    let remainingMs = 0;
    let totalMs = activeItem ? activeItem.durationSeconds * 1000 : 0;
    
    // 1. Calculate Remaining Time in MS
    if (status === ItemStatus.IDLE) {
      remainingMs = totalMs;
    } else if (status === ItemStatus.PAUSED && pausedAtTime !== null) {
      remainingMs = pausedAtTime;
    } else if (status === ItemStatus.RUNNING && targetEndTime) {
      remainingMs = targetEndTime - Date.now();
    }

    // 2. Calculate Progress Percentage (0% to 100% remaining)
    let pct = 0;
    if (totalMs > 0) {
      pct = (remainingMs / totalMs) * 100;
    }
    // Clamp pct for visual bar (so it doesn't invert in overtime)
    // If overtime (negative), remaining percent is effectively 0 for the bar
    setRemainingPercent(Math.max(0, Math.min(100, pct)));

    // Update color state for Text
    if (remainingMs < 0) {
      setTimerState('critical');
    } else if (remainingMs < 30000 || pct < 20) { // Less than 30s or 20%
      setTimerState('warning');
    } else {
      setTimerState('normal');
    }

    // 3. Determine Display Value (Desc or Asc)
    let msToDisplay = remainingMs;

    if (timerDirection === 'ASC' && activeItem) {
      // Elapsed logic
      msToDisplay = totalMs - remainingMs;
    }

    return formatTime(msToDisplay);
  };

  const formatTime = (ms: number) => {
    const isNegative = ms < 0 && timerDirection === 'DESC'; // Only show negative sign in countdown
    const absoluteMs = Math.abs(ms);
    const totalSeconds = Math.floor(absoluteMs / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    
    const mStr = minutes.toString().padStart(2, '0');
    const sStr = seconds.toString().padStart(2, '0');
    
    return `${isNegative ? '+' : ''}${mStr}:${sStr}`;
  };

  const animate = () => {
    const timeStr = calculate();
    setDisplayTime(timeStr);
    requestRef.current = requestAnimationFrame(animate);
  };

  useEffect(() => {
    requestRef.current = requestAnimationFrame(animate);
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [status, targetEndTime, pausedAtTime, activeItemId, timerDirection]);

  // Visual Styles
  let colorClass = 'text-broadcast-green';
  
  if (timerState === 'warning') {
    colorClass = 'text-broadcast-yellow';
  } 
  if (timerState === 'critical') {
    colorClass = 'text-broadcast-red animate-pulse';
  }
  
  if (status === ItemStatus.IDLE || status === ItemStatus.PAUSED) {
    if (status === ItemStatus.IDLE) {
       colorClass = 'text-white opacity-50';
    } else {
       colorClass += ' opacity-80';
    }
  }

  let sizeClass = 'text-6xl';
  let barMargin = 'mt-4';

  if (size === 'small') sizeClass = 'text-2xl';
  
  // ADMIN VIEW (LARGE)
  if (size === 'large') {
      sizeClass = 'text-[15vw] lg:text-[12rem] leading-none';
  }
  
  // NUCLEOS VIEW (MASSIVE) - Safe margin
  if (size === 'massive') {
      sizeClass = 'text-[15vw] leading-none';
      barMargin = 'mt-4'; 
  }

  // VIEWER EXCLUSIVE (MAXIMUM WIDTH)
  if (size === 'viewer') {
      // 26vw + tracking-tighter allows fitting 5 chars edge-to-edge
      sizeClass = 'text-[26vw] md:text-[min(26vw,65vh)] leading-none tracking-tighter';
      barMargin = 'mt-6';
  }

  // Bar Calculation
  // We want the bar to fill up from Left to Right.
  // The mask will sit on the right and shrink.
  // Mask Width = Remaining Percent.
  
  return (
    <div className="flex flex-col items-center justify-center w-full transition-all duration-300">
      <div className={`font-mono font-bold transition-colors duration-300 ${colorClass} ${sizeClass} tabular-nums text-center w-full`}>
        {displayTime}
      </div>
      
      {/* Segmented Progress Bar */}
      {showProgressBar && activeItemId && (
        <div className={`w-full h-6 ${barMargin} relative rounded-md overflow-hidden bg-gray-900 border border-gray-800 shadow-inner`}>
           
           {/* Layer 1: The Colored Zones (Fixed Background) */}
           <div className="absolute inset-0 flex opacity-30">
              <div className="h-full bg-broadcast-green" style={{ width: '70%' }}></div>
              <div className="h-full bg-broadcast-yellow" style={{ width: '20%' }}></div>
              <div className="h-full bg-broadcast-red" style={{ width: '10%' }}></div>
           </div>

           {/* Layer 2: The Active Filled Zones (Bright) */}
           {/* This is masked by Layer 3, creating the fill effect */}
           <div className="absolute inset-0 flex">
              <div className="h-full bg-broadcast-green shadow-[0_0_15px_rgba(0,224,85,0.6)]" style={{ width: '70%' }}></div>
              <div className="h-full bg-broadcast-yellow shadow-[0_0_15px_rgba(255,214,0,0.6)]" style={{ width: '20%' }}></div>
              <div className={`h-full bg-broadcast-red shadow-[0_0_15px_rgba(255,31,31,0.6)] ${timerState === 'critical' ? 'animate-pulse' : ''}`} style={{ width: '10%' }}></div>
           </div>

           {/* Layer 3: The Mask (Darkness covering the future) */}
           {/* Anchored right. Width = Remaining Time %. As time passes (remaining decreases), mask shrinks to right. */}
           <div 
             className="absolute right-0 top-0 h-full bg-gray-900/95 border-l border-gray-700"
             style={{ width: `${remainingPercent}%` }}
           ></div>

           {/* Segments Dividers (Visual Aid) */}
           <div className="absolute inset-0 pointer-events-none flex">
              <div style={{ width: '70%' }} className="h-full border-r border-black/50"></div>
              <div style={{ width: '20%' }} className="h-full border-r border-black/50"></div>
           </div>

        </div>
      )}
    </div>
  );
};

export default TimerDisplay;
