import React, { useState, useRef, useEffect } from 'react';
import { MessageCircle, Eraser, Folder, Check, Maximize2, X, Loader2, Mic, Send } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import rehypeKatex from 'rehype-katex';
import { MODELS, TRANSLATIONS } from '../constants';
import { Textbook, TextbookGroup } from './TextbookManager';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import { formatContent } from '../utils/formatUtils';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

interface QuestionData {
  summary: string;
  question: string;
  answer: string;
  explanation: string;
  precautions: string;
}

export function ChatBox({ data, model, setModel, lang, textbooks, groups }: { data: QuestionData, model: string, setModel: (m: string) => void, lang: 'zh' | 'en', textbooks: Textbook[], groups: TextbookGroup[] }) {
  const [messages, setMessages] = useState<{role: 'user' | 'model', text: string}[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [selectedChatTextbookIds, setSelectedChatTextbookIds] = useState<string[]>([]);
  const [showTextbookDropdown, setShowTextbookDropdown] = useState(false);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const t = TRANSLATIONS[lang];

  const clearChat = () => {
    setMessages([]);
    setInput('');
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowTextbookDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    setMessages([]);
    setInput('');
  }, [data.question]);

  useEffect(() => {
    if (textbooks.length > 0 && selectedChatTextbookIds.length === 0) {
      setSelectedChatTextbookIds(textbooks.map(b => b.id));
    }
  }, [textbooks]);

  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTo({
        top: chatContainerRef.current.scrollHeight,
        behavior: 'smooth'
      });
    }
  }, [messages, loading]);

  const startRecording = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert(lang === 'zh' ? '您的浏览器不支持语音识别。' : 'Your browser does not support speech recognition.');
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = lang === 'zh' ? 'zh-CN' : 'en-US';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => setIsRecording(true);
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setInput(prev => prev + transcript);
    };
    recognition.onerror = (event: any) => {
      console.error(event.error);
      setIsRecording(false);
    };
    recognition.onend = () => setIsRecording(false);
    recognition.start();
  };

  const handleSend = async (customText?: string) => {
    const messageToSend = customText || input.trim();
    if (!messageToSend) return;
    
    setInput('');
    setMessages(prev => [...prev, { role: 'user', text: messageToSend }]);
    setLoading(true);

    try {
      const history = messages.map(m => ({
        role: m.role,
        parts: [{ text: m.text }]
      }));

      let textbookParts: any[] = [];
      let textbookInstruction = "";
      if (selectedChatTextbookIds && selectedChatTextbookIds.length > 0) {
        for (const id of selectedChatTextbookIds) {
          const book = textbooks.find(b => b.id === id);
          if (book) {
            try {
              const response = await fetch(`/api/proxy?url=${encodeURIComponent(book.url)}`);
              if (!response.ok) throw new Error('Failed to fetch PDF');
              const blob = await response.blob();
              const base64 = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => {
                  const result = reader.result as string;
                  resolve(result.split(',')[1]);
                };
                reader.onerror = reject;
                reader.readAsDataURL(blob);
              });
              textbookParts.push({ inlineData: { data: base64, mimeType: 'application/pdf' } });
            } catch (err) {
              console.error("Failed to fetch textbook PDF", err);
            }
          }
        }
        if (textbookParts.length > 0) {
          textbookInstruction = `\n\nCRITICAL: Textbook PDFs have been provided. You MUST use these textbooks to answer the user's question. When you use information from the textbooks, you MUST explicitly state the page number where the information is found (e.g., "According to page 45 of the textbook...").`;
        }
      }

      const systemInstruction = `You are a helpful AI tutor. The user is asking about the following question:\n\nQuestion:\n${data.question}\n\nExplanation:\n${data.explanation}\n\nPrecautions:\n${data.precautions}\n\nAnswer the user's questions based on this context in ${lang === 'zh' ? 'Chinese' : 'English'}. ${textbookInstruction}

CRITICAL INSTRUCTIONS:
- You ONLY have access to the Question, Explanation, and Precautions text provided above, PLUS the textbook PDFs if provided.
- Use STRICT LaTeX for ALL math symbols, chemical formulas (e.g., $Cl_2$, $H_2O$, $Na^+$, $SO_4^{2-}$), units (e.g., $mol/L$, $g/cm^3$), and formatting.
- **Wrap EVERY single math/formula/unit/equation in $ for inline or $$ for block math. This is MANDATORY for chemical equations like $2NO_2 \rightleftharpoons N_2O_4$.**
- Example: Use $Cl_2$ instead of Cl2, use $1 \text{ mol}$ instead of 1mol, use $2H_2 + O_2 \rightarrow 2H_2O$ for equations.
- **For multiple-choice questions, ensure each option (A, B, C, D) starts on a NEW line.**
- Be concise and professional.
- Ensure all backslashes in LaTeX are properly escaped if you are returning JSON (though here you are returning raw text, still be careful with escape characters).`;

      const contents: any[] = [...history];
      
      const userParts: any[] = [];
      if (textbookParts.length > 0) {
        userParts.push(...textbookParts);
      }
      userParts.push({ text: messageToSend });
      
      contents.push({ role: 'user', parts: userParts });

      const response = await ai.models.generateContent({
        model: model,
        contents: contents,
        config: {
          systemInstruction,
          thinkingConfig: {
            thinkingLevel: model.includes('flash') ? ThinkingLevel.LOW : ThinkingLevel.HIGH
          }
        }
      });

      setMessages(prev => [...prev, { role: 'model', text: response.text || '' }]);
    } catch (err: any) {
      console.error(err);
      const errorMsg = lang === 'zh' ? `错误: ${err.message}` : `Error: ${err.message}`;
      setMessages(prev => [...prev, { role: 'model', text: errorMsg }]);
    } finally {
      setLoading(false);
    }
  };

  const quickActions = [
    { label: t.summaryAction, icon: '📝' },
    { label: t.exampleAction, icon: '💡' },
    { label: t.pitfallAction, icon: '⚠️' },
  ];

  const ChatContent = (
    <div className={`flex flex-col ${isFullScreen ? 'h-full' : ''}`}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <button 
            onClick={clearChat}
            className="p-1.5 bg-white/5 border border-white/10 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition-all active:scale-95"
            title={lang === 'zh' ? '清空对话' : 'Clear Chat'}
          >
            <Eraser className="w-4 h-4" />
          </button>
          <div 
            className="flex items-center gap-2 cursor-pointer group/header"
            onClick={() => textbooks.length > 0 && setShowTextbookDropdown(!showTextbookDropdown)}
          >
            <div className="p-1.5 bg-white/10 rounded-lg ring-1 ring-white/20">
              <MessageCircle className="w-4 h-4 text-white" />
            </div>
            <h4 className="font-semibold text-sm text-white tracking-tight group-hover/header:text-indigo-400 transition-colors">{t.aiChat}</h4>
            {textbooks.length > 0 && (
              <span className="text-[10px] text-zinc-500 bg-white/5 px-2 py-0.5 rounded-full border border-white/5">
                {lang === 'zh' ? `已关联 ${selectedChatTextbookIds.length} 本` : `${selectedChatTextbookIds.length} linked`}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {textbooks.length > 0 && (
            <div className="relative" ref={dropdownRef}>
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  setShowTextbookDropdown(!showTextbookDropdown);
                }}
                className={`bg-black/40 hover:bg-white/5 border border-white/10 text-zinc-300 text-[10px] rounded-full px-3 py-1.5 outline-none focus:ring-1 focus:ring-white cursor-pointer backdrop-blur-md max-w-[140px] truncate flex items-center gap-1.5 transition-all ${showTextbookDropdown ? 'ring-1 ring-white bg-white/10' : ''}`}
              >
                <Folder className="w-3 h-3" />
                {selectedChatTextbookIds.length === 0 
                  ? (lang === 'zh' ? '不关联教材' : 'No textbook') 
                  : (lang === 'zh' ? `选择教材` : `Select Books`)}
              </button>
              
              <AnimatePresence>
                {showTextbookDropdown && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    className="absolute right-0 top-full mt-2 w-56 bg-zinc-900 border border-white/10 rounded-xl shadow-2xl z-50 p-2 flex flex-col gap-1 max-h-64 overflow-y-auto custom-scrollbar backdrop-blur-xl"
                  >
                    <div className="px-2 py-1.5 mb-1 border-b border-white/5 flex items-center justify-between">
                      <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
                        {lang === 'zh' ? '选择关联教材' : 'Select Textbooks'}
                      </span>
                      <button 
                        onClick={() => setSelectedChatTextbookIds(selectedChatTextbookIds.length === textbooks.length ? [] : textbooks.map(b => b.id))}
                        className="text-[10px] text-blue-400 hover:text-blue-300"
                      >
                        {selectedChatTextbookIds.length === textbooks.length ? (lang === 'zh' ? '取消全选' : 'Deselect All') : (lang === 'zh' ? '全选' : 'Select All')}
                      </button>
                    </div>
                    
                    {groups.map(group => {
                      const groupBooks = textbooks.filter(b => b.groupId === group.id);
                      if (groupBooks.length === 0) return null;
                      const allGroupSelected = groupBooks.every(b => selectedChatTextbookIds.includes(b.id));
                      
                      return (
                        <div key={group.id} className="mb-2">
                          <div className="flex items-center justify-between px-2 py-1 mb-1">
                            <span className="text-[10px] font-bold text-zinc-400 flex items-center gap-1">
                              <Folder className="w-3 h-3" />
                              {group.name}
                            </span>
                            <button 
                              onClick={() => {
                                if (allGroupSelected) {
                                  setSelectedChatTextbookIds(prev => prev.filter(id => !groupBooks.find(b => b.id === id)));
                                } else {
                                  const newIds = [...selectedChatTextbookIds];
                                  groupBooks.forEach(b => {
                                    if (!newIds.includes(b.id)) newIds.push(b.id);
                                  });
                                  setSelectedChatTextbookIds(newIds);
                                }
                              }}
                              className="text-[9px] text-zinc-500 hover:text-white"
                            >
                              {allGroupSelected ? (lang === 'zh' ? '取消' : 'None') : (lang === 'zh' ? '全选' : 'All')}
                            </button>
                          </div>
                          {groupBooks.map(book => {
                            const isSelected = selectedChatTextbookIds.includes(book.id);
                            return (
                              <button
                                key={book.id}
                                onClick={() => {
                                  if (isSelected) {
                                    setSelectedChatTextbookIds(prev => prev.filter(id => id !== book.id));
                                  } else {
                                    setSelectedChatTextbookIds(prev => [...prev, book.id]);
                                  }
                                }}
                                className={`w-full text-left px-3 py-1.5 text-xs rounded-lg transition-all flex items-center justify-between group ${
                                  isSelected ? 'bg-white/10 text-white font-medium' : 'text-zinc-400 hover:bg-white/5 hover:text-white'
                                }`}
                              >
                                <span className="truncate flex-1 mr-2">{book.name}</span>
                                {isSelected && <Check className="w-3 h-3 shrink-0 text-white" />}
                              </button>
                            );
                          })}
                        </div>
                      );
                    })}

                    {textbooks.filter(b => !b.groupId).length > 0 && (
                      <div className="mb-2">
                        <div className="flex items-center justify-between px-2 py-1 mb-1">
                          <span className="text-[10px] font-bold text-zinc-400 flex items-center gap-1">
                            <Folder className="w-3 h-3" />
                            {lang === 'zh' ? '未分组' : 'Ungrouped'}
                          </span>
                          <button 
                            onClick={() => {
                              const ungroupedBooks = textbooks.filter(b => !b.groupId);
                              const allUngroupedSelected = ungroupedBooks.every(b => selectedChatTextbookIds.includes(b.id));
                              if (allUngroupedSelected) {
                                setSelectedChatTextbookIds(prev => prev.filter(id => !ungroupedBooks.find(b => b.id === id)));
                              } else {
                                const newIds = [...selectedChatTextbookIds];
                                ungroupedBooks.forEach(b => {
                                  if (!newIds.includes(b.id)) newIds.push(b.id);
                                });
                                setSelectedChatTextbookIds(newIds);
                              }
                            }}
                            className="text-[9px] text-zinc-500 hover:text-white"
                          >
                            {textbooks.filter(b => !b.groupId).every(b => selectedChatTextbookIds.includes(b.id)) ? (lang === 'zh' ? '取消' : 'None') : (lang === 'zh' ? '全选' : 'All')}
                          </button>
                        </div>
                        {textbooks.filter(b => !b.groupId).map(book => {
                          const isSelected = selectedChatTextbookIds.includes(book.id);
                          return (
                            <button
                              key={book.id}
                              onClick={() => {
                                if (isSelected) {
                                  setSelectedChatTextbookIds(prev => prev.filter(id => id !== book.id));
                                } else {
                                  setSelectedChatTextbookIds(prev => [...prev, book.id]);
                                }
                              }}
                              className={`w-full text-left px-3 py-1.5 text-xs rounded-lg transition-all flex items-center justify-between group ${
                                isSelected ? 'bg-white/10 text-white font-medium' : 'text-zinc-400 hover:bg-white/5 hover:text-white'
                              }`}
                            >
                              <span className="truncate flex-1 mr-2">{book.name}</span>
                              {isSelected && <Check className="w-3 h-3 shrink-0 text-white" />}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
          <select 
            value={model || ''} 
            onChange={e => setModel(e.target.value)}
            className="bg-black/40 hover:bg-white/5 border border-white/10 text-zinc-300 text-[10px] rounded-full px-2.5 py-1.5 outline-none focus:ring-1 focus:ring-white cursor-pointer backdrop-blur-md appearance-none text-center min-w-[80px]"
          >
            {MODELS.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
          <button 
            onClick={() => setIsFullScreen(!isFullScreen)}
            className="p-1.5 bg-white/5 border border-white/10 rounded-full text-zinc-400 hover:text-white hover:bg-white/10 transition-all active:scale-95"
            title={isFullScreen ? (lang === 'zh' ? '退出全屏' : 'Exit Full Screen') : (lang === 'zh' ? '全屏查看' : 'Full Screen')}
          >
            {isFullScreen ? <X className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </div>
      
      <div ref={chatContainerRef} className={`space-y-3 overflow-y-auto mb-3 pr-2 custom-scrollbar text-xs ${isFullScreen ? 'flex-1' : 'max-h-72'}`}>
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center py-6 space-y-4">
            <p className="text-zinc-500 text-xs">{t.askMe}</p>
            <div className="flex flex-wrap justify-center gap-2">
              {quickActions.map((action) => (
                <button
                  key={action.label}
                  onClick={() => handleSend(action.label)}
                  className="px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-full text-zinc-300 text-[10px] transition-all active:scale-95 flex items-center gap-1.5"
                >
                  <span>{action.icon}</span>
                  {action.label}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[90%] rounded-2xl px-3 py-2 ${msg.role === 'user' ? 'bg-white text-black' : 'bg-zinc-800 text-zinc-200'}`}>
              <div className="prose prose-invert prose-xs max-w-none">
                <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath, remarkBreaks]} rehypePlugins={[rehypeKatex]}>
                  {formatContent(msg.text)}
                </ReactMarkdown>
              </div>
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="max-w-[85%] rounded-2xl p-4 bg-zinc-800 text-zinc-400 flex items-center gap-2 text-sm">
              <Loader2 className="w-4 h-4 animate-spin" /> {t.thinking}
            </div>
          </div>
        )}
      </div>

      <div className="flex items-end gap-2">
        <textarea
          value={input || ''}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
          placeholder={t.placeholder}
          className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2 text-sm text-zinc-200 focus:outline-none focus:border-white/50 resize-none min-h-[40px] max-h-32"
          rows={1}
        />
        <button
          onClick={startRecording}
          className={`p-3 rounded-xl border transition-colors ${isRecording ? 'bg-red-500/20 border-red-500 text-red-500 animate-pulse' : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-800'}`}
          title={lang === 'zh' ? '语音输入' : 'Voice Input'}
        >
          <Mic className="w-5 h-5" />
        </button>
        <button
          onClick={() => handleSend()}
          disabled={loading || !input.trim()}
          className="p-3 rounded-xl bg-white text-black disabled:opacity-50 hover:bg-zinc-200 transition-colors shadow-[0_0_20px_rgba(255,255,255,0.4)] active:scale-95"
        >
          <Send className="w-5 h-5" />
        </button>
      </div>
    </div>
  );

  return (
    <>
      <div className="rounded-2xl border border-white/10 p-4 md:p-5 backdrop-blur-3xl mt-4 shadow-[0_0_30px_rgba(0,0,0,0.5)] ring-1 ring-white/5 liquid-panel">
        {ChatContent}
      </div>

      <AnimatePresence>
        {isFullScreen && (
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
              className="w-full max-w-4xl h-full max-h-[90vh] border border-white/10 rounded-3xl p-6 overflow-hidden flex flex-col shadow-2xl ring-1 ring-white/10 liquid-panel-strong"
            >
              {ChatContent}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
