import React, { useState } from 'react';
import { Delete, Divide, X, Minus, Plus, ChevronLeft, ChevronRight, CornerDownLeft } from 'lucide-react';
import { motion } from 'framer-motion';

interface MathKeyboardProps {
  onKeyClick: (key: string) => void;
  onDelete: () => void;
  onClear: () => void;
  onMoveCursor: (dir: 'left' | 'right') => void;
}

type TabType = '123' | 'f(x)' | 'abc' | 'sym';

const MathKeyboard: React.FC<MathKeyboardProps> = ({ onKeyClick, onDelete, onClear, onMoveCursor }) => {
  const [activeTab, setActiveTab] = useState<TabType>('123');

  const tabs: { id: TabType; label: string }[] = [
    { id: '123', label: '123' },
    { id: 'f(x)', label: 'f(x)' },
    { id: 'abc', label: 'ABC' },
    { id: 'sym', label: '#&~' },
  ];

  const renderKeys = () => {
    switch (activeTab) {
      case '123':
        return [
          ['x', 'y', 'π', 'e', '7', '8', '9', '×', '÷'],
          ['x²', 'xⁿ', '√', 'abs', '4', '5', '6', '+', '−'],
          ['<', '>', 'frac', 'log₁₀', '1', '2', '3', '=', 'DEL'],
          ['ans', ',', '(', ')', '0', '.', '←', '→', 'Enter']
        ];
      case 'f(x)':
        return [
          ['sin', 'cos', 'tan', '%', '!', '$', '(', ')', 'DEL'],
          ['asin', 'acos', 'atan', '{', '}', '≤', '≥', ',', 'Enter'],
          ['ln', 'log₁₀', 'log₂', 'log_b', 'd/dx', '∫', 'i', '←', '→'],
          ['eˣ', '10ˣ', 'ⁿ√', 'mat', '', '', '', '', '']
        ];
      case 'abc':
        return [
          ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
          ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', 'DEL'],
          ['z', 'x', 'c', 'v', 'b', 'n', 'm', ',', '.', 'Enter'],
          ['', '', '', '', '', '', '', '←', '→', '']
        ];
      case 'sym':
        return [
          ['∞', '≟', '≠', '∧', '∨', '¬', '⊗', '[', ']', 'DEL'],
          ['∥', '⊥', '∈', '⊂', '⊆', '∠', '→', '⬚', '⬚', 'Enter'],
          ['( )', '{ }', '[ ]', '\\', '&', '@', '#', '$', '€', ''],
          [';', ':', '\'', '"', '«', '»', '←', '→', '', '']
        ];
    }
  };

  const getIcon = (key: string) => {
    switch (key) {
      case 'DEL': return <Delete size={18} />;
      case '÷': return <Divide size={18} />;
      case '×': return <X size={18} />;
      case '−': return <Minus size={18} />;
      case '+': return <Plus size={18} />;
      case '←': return <ChevronLeft size={18} />;
      case '→': return <ChevronRight size={18} />;
      case 'Enter': return <CornerDownLeft size={18} />;
      default: return null;
    }
  };

  const handleClick = (key: string) => {
    if (!key) return;
    if (key === 'DEL') onDelete();
    else if (key === 'AC') onClear();
    else if (key === 'Enter') return;
    else if (key === '←') onMoveCursor('left');
    else if (key === '→') onMoveCursor('right');
    else {
      // Mapping display keys to mathjs strings
    const keyMap: Record<string, string> = {
      'x²': '^2',
      'xⁿ': '^',
      '√': 'sqrt(',
      'abs': 'abs(',
      'frac': 'frac',
      'log₁₀': 'log10(',
      'log₂': 'log2(',
      'π': 'PI',
      'e': 'e',
      'ans': 'ans',
      'asin': 'asin(',
      'acos': 'acos(',
      'atan': 'atan(',
      'ln': 'log(',
      'log_b': 'log(',
      'eˣ': 'exp(',
      '10ˣ': '10^',
      'ⁿ√': 'nthRoot(',
      '×': '*',
      '÷': '/',
      '−': '-',
      'sin': 'sin(',
      'cos': 'cos(',
      'tan': 'tan(',
    };

    const value = keyMap[key] || key;
    onKeyClick(value);
    }
  };

  const keys = renderKeys();
  const gridCols = (activeTab === 'abc' || activeTab === 'sym') ? 'grid-cols-10' : 'grid-cols-9';

  const getButtonClass = (key: string) => {
    if (!key) return 'opacity-0 pointer-events-none';
    
    const base = 'flex items-center justify-center h-11 rounded-lg text-sm font-medium transition-all shadow-sm';
    
    // Control keys - Dark mode: zinc-800
    if (['DEL', 'Enter', '←', '→'].includes(key)) {
      return `${base} bg-zinc-800 text-zinc-300 hover:bg-zinc-700`;
    }
    
    // Operators & Symbols - Dark mode: zinc-700
    if (['+', '−', '×', '÷', '=', '<', '>', '≤', '≥', '≟', '≠'].includes(key)) {
      return `${base} bg-zinc-700/50 text-zinc-100 hover:bg-zinc-700 border border-white/10`;
    }
    
    // Numbers - Dark mode: zinc-900
    if (/^[0-9.]$/.test(key)) {
      return `${base} bg-zinc-900 text-zinc-100 hover:bg-zinc-800 border border-white/5`;
    }
    
    // Variables/Constants/Functions - Dark mode: white/5
    return `${base} bg-white/5 text-zinc-300 hover:bg-white/10 border border-white/5`;
  };

  return (
    <div className="flex flex-col gap-2 p-2 bg-black/40 rounded-2xl border border-white/10 shadow-xl backdrop-blur-md overflow-hidden">
      {/* Tabs */}
      <div className="flex bg-white/5 p-1 rounded-xl gap-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${
              activeTab === tab.id 
                ? 'bg-white text-black shadow-lg' 
                : 'text-zinc-500 hover:bg-white/5'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Keyboard Grid */}
      <div className={`grid ${gridCols} gap-1`}>
        {keys.flat().map((key, idx) => (
          <motion.button
            key={`${key}-${idx}`}
            onClick={() => handleClick(key)}
            disabled={!key}
            whileTap={{ 
              scale: 0.92,
              backgroundColor: "rgba(255, 255, 255, 0.9)",
              color: "#000",
              boxShadow: "0 0 20px rgba(255, 255, 255, 0.6)"
            }}
            transition={{ duration: 0.1 }}
            className={`${getButtonClass(key)} ${activeTab === 'abc' || activeTab === 'sym' ? 'text-xs h-10' : ''}`}
          >
            {getIcon(key) || key}
          </motion.button>
        ))}
      </div>
    </div>
  );
};

export default MathKeyboard;
