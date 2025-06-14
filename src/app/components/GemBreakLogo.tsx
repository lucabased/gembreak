'use client';

import React from 'react';

const GemBreakLogo = ({ className = "" }: { className?: string }) => {
  return (
    <div className={`inline-block ${className}`}>
      <span className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 via-pink-500 to-red-500">
        Gem
      </span>
      <span className="text-2xl font-bold text-sky-400">
        Break
      </span>
    </div>
  );
};

export default GemBreakLogo;
