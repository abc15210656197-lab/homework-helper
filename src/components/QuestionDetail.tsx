import React, { useState, useEffect, useMemo } from 'react';
import { ArrowLeft, ChevronLeft, ChevronRight, BookOpen, Copy, Check, Maximize2, X, Info, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import rehypeKatex from 'rehype-katex';
import { TRANSLATIONS } from '../constants';
import { formatContent } from '../utils/formatUtils';
import { ChatBox } from './ChatBox';
import { Textbook, TextbookGroup } from './TextbookManager';

interface QuestionData {
  summary: string;
  question: string;
  answer: string;
  explanation: string;
  precautions: string;
}

export function QuestionDetail({ 
  data, onBack, onNext, onPrev, hasNext, hasPrev, model, setModel, lang, textbooks, groups,
  allQuestions, currentIndex, onSelectQuestion
}: { 
  data: QuestionData; onBack: () => void; onNext: () => void; onPrev: () => void; hasNext: boolean; hasPrev: boolean; model: string; setModel: (m: string) => void; lang: 'zh' | 'en'; textbooks: Textbook[]; groups: TextbookGroup[];
  allQuestions?: QuestionData[]; currentIndex?: number; onSelectQuestion?: (index: number) => void;
}) {
  const [copied, setCopied] = useState(false);
  const [touchStart, setTouchStart] = useState<{x: number, y: number} | null>(null);
  const [touchEnd, setTouchEnd] = useState<{x: number, y: number} | null>(null);
  const [fullScreenPanel, setFullScreenPanel] = useState<'question' | 'explanation' | 'precautions' | 'answer' | null>(null);
  const t = TRANSLATIONS[lang];

  const [subQ, setSubQ] = useState<string | null>(null);
  const [subSubQ, setSubSubQ] = useState<string | null>(null);

  const structure = useMemo(() => {
    const s: { label: string, children: string[] }[] = [];
    const regex1 = /(?:^|\s)(\(\d+\)|\d+\.|[\u2460-\u2473])(?=\s|$)/g;
    let match;
    const matches: { label: string, index: number }[] = [];
    
    let tempText = data.question;
    while ((match = regex1.exec(tempText)) !== null) {
      matches.push({ label: match[1], index: match.index });
    }

    if (matches.length > 0) {
      matches.forEach((m, i) => {
        const next = matches[i+1];
        const content = data.question.slice(m.index, next ? next.index : undefined);
        const children: string[] = [];
        const regex2 = /(?:^|\s)(?:\(([a-z])\)|([a-z])(?:\.|\)))(?=\s)/g;
        let m2;
        while ((m2 = regex2.exec(content)) !== null) {
          children.push(m2[1] || m2[2]);
        }
        s.push({ label: m.label, children });
      });
    }
    return s;
  }, [data.question]);

  useEffect(() => {
    if (structure.length > 0) {
      setSubQ(structure[0].label);
      setSubSubQ(structure[0].children.length > 0 ? structure[0].children[0] : null);
    } else {
      setSubQ(null);
      setSubSubQ(null);
    }
  }, [structure]);

  const getSegment = (text: string, l1: string | null, l2: string | null) => {
    if (!l1 || !text) return text;
    
    const escapeRegExp = (string: string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const escapedL1 = escapeRegExp(l1);
    
    const regex1 = new RegExp(`(?:^|\\s)${escapedL1}(?=\\s|$)`);
    const match1 = text.match(regex1);
    if (!match1) return text;
    const startIndex1 = match1.index!;
    
    const regexAnyL1 = /(?:^|\s)(\(\d+\)|\d+\.|[\u2460-\u2473])(?=\s|$)/g;
    regexAnyL1.lastIndex = startIndex1 + l1.length;
    const nextMatch = regexAnyL1.exec(text);
    const endIndex1 = nextMatch ? nextMatch.index : text.length;
    
    let content = text.slice(startIndex1, endIndex1);
    
    if (!l2) return content;
    
    const regex2 = new RegExp(`(?:^|\\s)(?:\\(${l2}\\)|${l2}(?:\\.|\\)))(?=\\s)`);
    const match2 = content.match(regex2);
    if (!match2) return content;
    const startIndex2 = match2.index!;
    
    const regexAnyL2 = /(?:^|\s)(?:\([a-z]\)|[a-z](?:\.|\)))(?=\s)/g;
    regexAnyL2.lastIndex = startIndex2 + 1;
    const nextMatch2 = regexAnyL2.exec(content);
    const endIndex2 = nextMatch2 ? nextMatch2.index : content.length;
    
    return content.slice(startIndex2, endIndex2);
  };

  const minSwipeDistance = 50;

  const onTouchStart = (e: React.TouchEvent) => {
    setTouchEnd(null);
    setTouchStart({ x: e.targetTouches[0].clientX, y: e.targetTouches[0].clientY });
  };

  const onTouchMove = (e: React.TouchEvent) => {
    setTouchEnd({ x: e.targetTouches[0].clientX, y: e.targetTouches[0].clientY });
  };

  const onTouchEnd = () => {
    if (!touchStart || !touchEnd) return;
    const distanceX = touchStart.x - touchEnd.x;
    const distanceY = touchStart.y - touchEnd.y;
    
    if (Math.abs(distanceX) > Math.abs(distanceY) && Math.abs(distanceX) > minSwipeDistance) {
      if (distanceX > 0 && hasNext) {
        onNext();
      } else if (distanceX < 0 && hasPrev) {
        onPrev();
      }
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(data.question);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const PanelHeader = ({ title, icon: Icon, type, showCopy }: { title: string, icon: any, type: 'question' | 'explanation' | 'precautions' | 'answer', showCopy?: boolean }) => (
    <div className="flex items-center justify-between px-5 py-2.5 border-b border-white/5 bg-white/5">
      <div className="flex items-center gap-2">
        <div className={`p-1.5 rounded-lg ring-1 ${
          type === 'question' ? 'bg-white/10 ring-white/20' : 
          type === 'answer' ? 'bg-rose-500/20 ring-rose-500/30' :
          type === 'explanation' ? 'bg-emerald-500/20 ring-emerald-500/30' : 
          'bg-amber-500/20 ring-amber-500/30'
        }`}>
          <Icon className={`w-4 h-4 ${
            type === 'question' ? 'text-white' : 
            type === 'answer' ? 'text-rose-400' :
            type === 'explanation' ? 'text-emerald-400' : 
            'text-amber-400'
          }`} />
        </div>
        <h3 className="font-semibold text-xs text-white tracking-tight">{title}</h3>
      </div>
      <div className="flex items-center gap-2">
        {showCopy && (
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold text-zinc-900 bg-white rounded-full hover:bg-zinc-200 transition-all active:scale-95 shadow-[0_0_15px_rgba(255,255,255,0.2)]"
          >
            {copied ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
            {copied ? t.copied : t.copy}
          </button>
        )}
        <button 
          onClick={() => setFullScreenPanel(fullScreenPanel === type ? null : type)}
          className="p-1.5 bg-white/5 border border-white/10 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition-all active:scale-95"
          title={fullScreenPanel === type ? (lang === 'zh' ? '退出全屏' : 'Exit Full Screen') : (lang === 'zh' ? '全屏查看' : 'Full Screen')}
        >
          {fullScreenPanel === type ? <X className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );

  const QuestionContent = (isFull: boolean) => (
    <div className={`p-3 md:p-4 prose prose-invert prose-zinc prose-sm max-w-none overflow-x-auto bg-zinc-900/30 ${isFull ? 'flex-1 overflow-y-auto' : ''}`}>
      <div className="markdown-body">
        <ReactMarkdown 
          remarkPlugins={[remarkGfm, remarkMath, remarkBreaks]} 
          rehypePlugins={[rehypeKatex]}
          components={{
            img: ({node, src, ...props}) => {
              if (!src) return null;
              return <img src={src} {...props} className="rounded-lg border border-white/10 shadow-lg" />;
            }
          }}
        >
          {formatContent(getSegment(data.question, subQ, subSubQ))}
        </ReactMarkdown>
      </div>
    </div>
  );

  const AnswerContent = (isFull: boolean) => (
    <div className={`p-4 text-zinc-200 font-medium text-lg overflow-y-auto ${isFull ? 'flex-1' : ''}`}>
      <div className="markdown-body">
        <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath, remarkBreaks]} rehypePlugins={[rehypeKatex]}>
          {formatContent(getSegment(data.answer, subQ, subSubQ))}
        </ReactMarkdown>
      </div>
    </div>
  );

  const ExplanationContent = (isFull: boolean) => (
    <div className={`prose prose-invert prose-zinc prose-xs max-w-none text-zinc-300 leading-relaxed overflow-y-auto pr-2 custom-scrollbar ${isFull ? 'flex-1' : 'max-h-64'}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath, remarkBreaks]} rehypePlugins={[rehypeKatex]}>
        {formatContent(getSegment(data.explanation, subQ, subSubQ))}
      </ReactMarkdown>
    </div>
  );

  const PrecautionsContent = (isFull: boolean) => (
    <div className={`prose prose-invert prose-zinc prose-xs max-w-none text-zinc-300 leading-relaxed overflow-y-auto pr-2 custom-scrollbar ${isFull ? 'flex-1' : 'max-h-64'}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath, remarkBreaks]} rehypePlugins={[rehypeKatex]}>
        {formatContent(getSegment(data.precautions, subQ, subSubQ))}
      </ReactMarkdown>
    </div>
  );

  return (
    <motion.div
      key={data.question}
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="space-y-4"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-zinc-400 hover:text-white transition-colors group"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
          {t.back}
        </button>
        <div className="flex items-center gap-2">
          <button onClick={onPrev} disabled={!hasPrev} className="p-2 rounded-full bg-zinc-900 border border-zinc-800 text-zinc-400 disabled:opacity-30 hover:text-white hover:bg-zinc-800 transition-colors">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button onClick={onNext} disabled={!hasNext} className="p-2 rounded-full bg-zinc-900 border border-zinc-800 text-zinc-400 disabled:opacity-30 hover:text-white hover:bg-zinc-800 transition-colors">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {allQuestions && allQuestions.length > 1 && (
        <div className="flex items-center gap-2 overflow-x-auto p-2 mb-4 bg-white/5 rounded-xl border border-white/5 no-scrollbar">
          {allQuestions.map((q, idx) => {
            let label = `${idx + 1}`;
            const match = q.question.match(/^\s*\((\d+)\)/) || q.question.match(/^\s*(\d+)\./);
            if (match) label = match[1];
            
            return (
              <button
                key={idx}
                onClick={() => onSelectQuestion && onSelectQuestion(idx)}
                className={`flex-shrink-0 w-8 h-8 rounded-lg text-xs font-bold flex items-center justify-center transition-all ${
                  idx === currentIndex 
                    ? 'bg-white text-black shadow-lg scale-110' 
                    : 'bg-white/5 text-zinc-400 hover:bg-white/10 hover:text-zinc-200'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      )}

      {structure.length > 0 && (
        <div className="flex flex-col gap-2 mb-4 animate-in fade-in slide-in-from-top-2 duration-300">
          <div className="flex items-center gap-2 overflow-x-auto p-1 no-scrollbar">
            {structure.map(s => (
              <button
                key={s.label}
                onClick={() => { setSubQ(s.label); setSubSubQ(s.children.length > 0 ? s.children[0] : null); }}
                className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${
                  subQ === s.label 
                    ? 'bg-white text-black border-white shadow-lg scale-105' 
                    : 'bg-white/5 text-zinc-400 border-white/5 hover:bg-white/10 hover:text-zinc-200'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
          
          {subQ && structure.find(s => s.label === subQ)?.children && structure.find(s => s.label === subQ)!.children.length > 0 && (
             <div className="flex items-center gap-2 overflow-x-auto p-1 pl-2 ml-1 border-l-2 border-white/10 no-scrollbar animate-in fade-in slide-in-from-left-2 duration-300">
               {structure.find(s => s.label === subQ)?.children.map(child => (
                 <button
                   key={child}
                   onClick={() => setSubSubQ(child)}
                   className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${
                     subSubQ === child 
                       ? 'bg-white text-black border-white shadow-lg scale-105' 
                       : 'bg-white/5 text-zinc-400 border-white/5 hover:bg-white/10 hover:text-zinc-200'
                   }`}
                 >
                   {child}
                 </button>
               ))}
             </div>
          )}
        </div>
      )}

      <div className="rounded-2xl border border-white/10 overflow-hidden shadow-[0_0_40px_rgba(0,0,0,0.6)] backdrop-blur-3xl ring-1 ring-white/5 liquid-panel">
        <PanelHeader title={t.questionContent} icon={BookOpen} type="question" showCopy />
        {QuestionContent(false)}
      </div>

      <div className="rounded-2xl border border-white/10 overflow-hidden shadow-[0_0_40px_rgba(0,0,0,0.6)] backdrop-blur-3xl ring-1 ring-white/5 liquid-panel">
        <PanelHeader title={t.answer} icon={Check} type="answer" />
        {AnswerContent(false)}
      </div>

      <div className="grid md:grid-cols-2 gap-3">
        <div className="rounded-2xl border border-white/10 p-4 md:p-5 backdrop-blur-3xl ring-1 ring-white/5 liquid-panel">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-emerald-500/20 rounded-lg ring-1 ring-emerald-500/30">
                <Info className="w-4 h-4 text-emerald-400" />
              </div>
              <h4 className="font-semibold text-xs text-white tracking-tight">{t.explanation}</h4>
            </div>
            <button 
              onClick={() => setFullScreenPanel('explanation')}
              className="p-1.5 bg-white/5 border border-white/10 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition-all active:scale-95"
              title={lang === 'zh' ? '全屏查看' : 'Full Screen'}
            >
              <Maximize2 className="w-4 h-4" />
            </button>
          </div>
          {ExplanationContent(false)}
        </div>

        <div className="rounded-2xl border border-white/10 p-4 md:p-5 backdrop-blur-3xl ring-1 ring-white/5 liquid-panel">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-amber-500/20 rounded-lg ring-1 ring-amber-500/30">
                <AlertCircle className="w-4 h-4 text-amber-400" />
              </div>
              <h4 className="font-semibold text-xs text-white tracking-tight">{t.precautions}</h4>
            </div>
            <button 
              onClick={() => setFullScreenPanel('precautions')}
              className="p-1.5 bg-white/5 border border-white/10 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition-all active:scale-95"
              title={lang === 'zh' ? '全屏查看' : 'Full Screen'}
            >
              <Maximize2 className="w-4 h-4" />
            </button>
          </div>
          {PrecautionsContent(false)}
        </div>
      </div>
      
      <ChatBox data={data} model={model} setModel={setModel} lang={lang} textbooks={textbooks} groups={groups} />

      <AnimatePresence>
        {fullScreenPanel && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-3xl p-4 md:p-8 flex items-center justify-center"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="w-full max-w-4xl h-full max-h-[90vh] border border-white/10 rounded-3xl overflow-hidden flex flex-col shadow-2xl ring-1 ring-white/10 liquid-panel-strong"
            >
              {fullScreenPanel === 'question' && (
                <>
                  <PanelHeader title={t.questionContent} icon={BookOpen} type="question" showCopy />
                  {QuestionContent(true)}
                </>
              )}
              {fullScreenPanel === 'answer' && (
                <div className="p-6 flex flex-col h-full">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 bg-rose-500/20 rounded-lg ring-1 ring-rose-500/30">
                        <Check className="w-4 h-4 text-rose-400" />
                      </div>
                      <h4 className="font-semibold text-sm text-white tracking-tight">{t.answer}</h4>
                    </div>
                    <button 
                      onClick={() => setFullScreenPanel(null)}
                      className="p-1.5 bg-white/10 border border-white/20 rounded-lg text-zinc-400 hover:text-white hover:bg-white/20 transition-all active:scale-95"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                  <div className="p-4 text-zinc-200 font-medium text-lg flex-1 overflow-y-auto">
                    {data.answer}
                  </div>
                </div>
              )}
              {fullScreenPanel === 'explanation' && (
                <div className="p-6 flex flex-col h-full">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 bg-emerald-500/20 rounded-lg ring-1 ring-emerald-500/30">
                        <Info className="w-4 h-4 text-emerald-400" />
                      </div>
                      <h4 className="font-semibold text-sm text-white tracking-tight">{t.explanation}</h4>
                    </div>
                    <button 
                      onClick={() => setFullScreenPanel(null)}
                      className="p-1.5 bg-white/10 border border-white/20 rounded-lg text-zinc-400 hover:text-white hover:bg-white/20 transition-all active:scale-95"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                  {ExplanationContent(true)}
                </div>
              )}
              {fullScreenPanel === 'precautions' && (
                <div className="p-6 flex flex-col h-full">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 bg-amber-500/20 rounded-lg ring-1 ring-amber-500/30">
                        <AlertCircle className="w-4 h-4 text-amber-400" />
                      </div>
                      <h4 className="font-semibold text-sm text-white tracking-tight">{t.precautions}</h4>
                    </div>
                    <button 
                      onClick={() => setFullScreenPanel(null)}
                      className="p-1.5 bg-white/10 border border-white/20 rounded-lg text-zinc-400 hover:text-white hover:bg-white/20 transition-all active:scale-95"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                  {PrecautionsContent(true)}
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export function QuestionListItem({ data, index, onClick, lang }: { data: QuestionData; index: number; onClick: () => void; lang: 'zh' | 'en' }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      onClick={onClick}
      className="group hover:bg-white/5 border border-white/10 hover:border-white/20 p-3.5 rounded-xl cursor-pointer transition-all duration-300 flex items-center justify-between shadow-lg backdrop-blur-2xl liquid-panel"
    >
      <div className="flex items-center gap-3 overflow-hidden">
        <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center text-zinc-400 text-sm font-bold group-hover:bg-white group-hover:text-black transition-colors shrink-0">
          {index + 1}
        </div>
        <div className="overflow-hidden">
          <h4 className="text-zinc-200 text-sm font-medium truncate group-hover:text-white transition-colors">
            {data.question.replace(/[$#*`]/g, '').slice(0, 40)}...
          </h4>
          <p className="text-zinc-500 text-[8px] mt-0.5 truncate uppercase tracking-wider">
            {lang === 'zh' ? '点击查看详细讲解与注意事项' : 'Click to view detailed explanation and notes'}
          </p>
        </div>
      </div>
      <ChevronRight className="w-5 h-5 text-zinc-700 group-hover:text-white group-hover:translate-x-1 transition-all shrink-0" />
    </motion.div>
  );
}
