import { useState, useRef, useEffect } from 'react';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import { Camera, Send, Loader2, Book, FileText, ImageIcon, RefreshCw, Check, MessageSquare, Folder } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { formatContent } from '../utils/formatUtils';
import { Textbook, TextbookGroup } from './TextbookManager';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export function MaterialAssistant({ lang, materials, groups, onManageMaterials, onSaveHistory, initialData, isAdmin = false }: { 
  lang: 'zh' | 'en', 
  materials: Textbook[],
  groups: TextbookGroup[],
  onManageMaterials: () => void,
  onSaveHistory?: (module: string, summary: string, content: any, file?: File | { base64: string, mimeType: string }) => void,
  initialData?: any,
  isAdmin?: boolean
}) {
  const [topic, setTopic] = useState('');
  const [image, setImage] = useState<{ base64: string, mimeType: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState('');
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedMaterialIds, setSelectedMaterialIds] = useState<string[]>([]);
  const [showMaterialDropdown, setShowMaterialDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [initialParts, setInitialParts] = useState<any[]>([]);
  const [chatHistory, setChatHistory] = useState<{role: 'user'|'model', text: string}[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatModel, setChatModel] = useState('gemini-3-flash-preview');
  const [isChatting, setIsChatting] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (initialData) {
      setTopic(initialData.topic || '');
      setResult(initialData.result || '');
      setChatHistory(initialData.chatHistory || []);
      if (initialData.selectedMaterialIds) setSelectedMaterialIds(initialData.selectedMaterialIds);
      if (initialData.image_url) {
        fetch(initialData.image_url)
          .then(res => res.blob())
          .then(blob => {
            const reader = new FileReader();
            reader.onloadend = () => {
              const base64 = (reader.result as string).split(',')[1];
              setImage({ base64, mimeType: blob.type });
            };
            reader.readAsDataURL(blob);
          })
          .catch(err => console.error('Failed to restore image', err));
      } else {
        setImage(null);
      }
    }
  }, [initialData]);

  useEffect(() => {
    if (materials.length > 0 && selectedMaterialIds.length === 0 && !initialData) {
      setSelectedMaterialIds(materials.map(m => m.id));
    }
  }, [materials]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowMaterialDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatHistory, result]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = (reader.result as string).split(',')[1];
      setImage({ base64, mimeType: file.type });
    };
    reader.readAsDataURL(file);
  };

  const handleGenerate = async () => {
    if (!topic.trim() && !image) {
      setError(lang === 'zh' ? '请输入作文题或上传图片' : 'Please enter a topic or upload an image');
      return;
    }

    if (selectedMaterialIds.length === 0) {
      setError(lang === 'zh' ? '请先选择至少一本素材书' : 'Please select at least one material book');
      return;
    }

    setLoading(true);
    setError(null);
    setResult('');
    setChatHistory([]);

    try {
      const parts: any[] = [];
      
      // Add materials
      const selectedMaterials = materials.filter(m => selectedMaterialIds.includes(m.id));
      for (const material of selectedMaterials) {
        try {
          const response = await fetch(material.url);
          if (!response.ok) throw new Error('Failed to fetch PDF');
          const blob = await response.blob();
          const base64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
              if (typeof reader.result === 'string') {
                resolve(reader.result.split(',')[1]);
              } else {
                reject(new Error('Failed to read file as base64'));
              }
            };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });
          parts.push({ inlineData: { data: base64, mimeType: 'application/pdf' } });
        } catch (err) {
          console.error("Failed to fetch material PDF", err);
        }
      }

      if (image) {
        parts.push({ inlineData: { data: image.base64, mimeType: image.mimeType } });
      }

      const promptText = lang === 'zh' 
        ? `请根据提供的作文题（文本或图片），从提供的素材书中提取贴合该作文题的各类素材。
作文题：${topic}

要求：
1. 深入分析作文题的立意。
2. 从素材书中提取相关的名人名言、典型事例、文学典故等。
3. 给出每条素材在写作中的具体运用建议。
4. 必须明确指出素材在素材书中的具体位置（如页码或章节）。
5. 使用 Markdown 格式输出，结构清晰。`
        : `Based on the provided essay topic (text or image), extract various materials from the provided material book that fit the topic.
Topic: ${topic}

Requirements:
1. Analyze the core theme of the essay topic.
2. Extract relevant quotes, typical examples, literary allusions, etc. from the material book.
3. Provide specific suggestions on how to use each material in writing.
4. You MUST explicitly state the specific location of the material in the material book (e.g., page number or chapter).
5. Use Markdown format with clear structure.`;

      parts.push({ text: promptText });

      setInitialParts(parts);

      const response = await ai.models.generateContentStream({
        model: chatModel,
        contents: { parts },
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH }
        }
      });

      let finalResult = '';
      for await (const chunk of response) {
        const chunkText = chunk.text || '';
        setResult(prev => prev + chunkText);
        finalResult += chunkText;
      }

      if (onSaveHistory) {
        onSaveHistory('material-assistant', topic || (lang === 'zh' ? '作文素材提取' : 'Material Extraction'), { topic, result: finalResult, chatHistory: [], selectedMaterialIds }, image || undefined);
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Error generating materials');
    } finally {
      setLoading(false);
    }
  };

  const handleChatSubmit = async () => {
    if (!chatInput.trim()) return;
    
    const newUserMsg = { role: 'user' as const, text: chatInput };
    setChatHistory(prev => [...prev, newUserMsg]);
    setChatInput('');
    setIsChatting(true);
    
    try {
      let currentInitialParts = initialParts;
      if (currentInitialParts.length === 0 && selectedMaterialIds.length > 0) {
        const parts: any[] = [];
        const selectedMaterials = materials.filter(m => selectedMaterialIds.includes(m.id));
        for (const material of selectedMaterials) {
          try {
            const response = await fetch(material.url);
            if (!response.ok) throw new Error('Failed to fetch PDF');
            const blob = await response.blob();
            const base64 = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
              reader.onerror = reject;
              reader.readAsDataURL(blob);
            });
            parts.push({
              inlineData: {
                data: base64,
                mimeType: 'application/pdf'
              }
            });
          } catch (err) {
            console.error(`Failed to load material ${material.name}:`, err);
          }
        }
        
        if (image) {
          parts.push({
            inlineData: {
              data: image.base64,
              mimeType: image.mimeType
            }
          });
        }
        
        const promptText = lang === 'zh' 
          ? `你是一个专业的作文素材助手。请根据提供的素材书（PDF）和作文题（${topic ? `题目：${topic}` : '见附图'}），为我提取合适的写作素材。
要求：
1. 必须从提供的素材书中提取素材，不能凭空捏造。
2. 提取的素材要与作文题高度相关。
3. 给出素材的原文摘录，并提供简短的分析，说明该素材如何应用于这篇作文。
4. 必须明确标出素材在素材书中的具体位置（如页码或章节）。
5. 使用 Markdown 格式，结构清晰。`
          : `You are a professional essay material assistant. Based on the provided material books (PDFs) and the essay topic (${topic ? `Topic: ${topic}` : 'see attached image'}), please extract suitable writing materials for me.
Requirements:
1. You MUST extract materials from the provided material books, do not fabricate.
2. The extracted materials must be highly relevant to the essay topic.
3. Provide excerpts of the materials and a brief analysis explaining how to apply them to this essay.
4. You MUST explicitly state the specific location of the material in the material book (e.g., page number or chapter).
5. Use Markdown format with clear structure.`;

        parts.push({ text: promptText });
        setInitialParts(parts);
        currentInitialParts = parts;
      }

      const contents = [
        { role: 'user', parts: currentInitialParts },
        { role: 'model', parts: [{ text: result }] },
        ...chatHistory.map(msg => ({ role: msg.role, parts: [{ text: msg.text }] })),
        { role: 'user', parts: [{ text: newUserMsg.text }] }
      ];
      
      const response = await ai.models.generateContentStream({
        model: chatModel,
        contents,
        config: {
          thinkingConfig: chatModel.includes('pro') ? { thinkingLevel: ThinkingLevel.HIGH } : undefined
        }
      });
      
      setChatHistory(prev => [...prev, { role: 'model', text: '' }]);
      
      let modelResponseText = '';
      for await (const chunk of response) {
        modelResponseText += (chunk.text || '');
        setChatHistory(prev => {
          const newHistory = [...prev];
          newHistory[newHistory.length - 1].text = modelResponseText;
          return newHistory;
        });
      }
      
      if (onSaveHistory) {
        onSaveHistory('material-assistant', topic || (lang === 'zh' ? '作文素材提取' : 'Material Extraction'), { 
          topic, 
          result, 
          chatHistory: [...chatHistory, newUserMsg, { role: 'model', text: modelResponseText }],
          selectedMaterialIds 
        }, image || undefined);
      }
    } catch (err: any) {
      console.error(err);
      setChatHistory(prev => [...prev, { role: 'model', text: lang === 'zh' ? '生成失败，请重试。' : 'Failed to generate, please try again.' }]);
    } finally {
      setIsChatting(false);
    }
  };

  return (
    <div className="flex flex-col h-full gap-4 p-4 md:p-6">
      <div className="flex flex-col gap-4">
        <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div 
              className="flex items-center gap-2 cursor-pointer group/header"
              onClick={() => materials.length > 0 && setShowMaterialDropdown(!showMaterialDropdown)}
            >
              <Book className={`w-5 h-5 transition-colors ${selectedMaterialIds.length > 0 ? 'text-emerald-400' : 'text-zinc-500'}`} />
              <h3 className="text-sm font-bold text-white group-hover/header:text-emerald-400 transition-colors">
                {lang === 'zh' ? `已关联素材书 (${selectedMaterialIds.length}本)` : `Associated Material Books (${selectedMaterialIds.length})`}
              </h3>
            </div>
            <div className="flex items-center gap-2">
              {materials.length > 0 && (
                <div className="relative" ref={dropdownRef}>
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowMaterialDropdown(!showMaterialDropdown);
                    }}
                    className={`bg-black/40 hover:bg-white/5 border border-white/10 text-zinc-300 text-[10px] rounded-full px-3 py-1.5 outline-none focus:ring-1 focus:ring-white cursor-pointer backdrop-blur-md max-w-[140px] truncate flex items-center gap-1.5 transition-all ${showMaterialDropdown ? 'ring-1 ring-white bg-white/10' : ''}`}
                  >
                    <Folder className="w-3 h-3" />
                    {selectedMaterialIds.length === 0 
                      ? (lang === 'zh' ? '选择素材' : 'Select Materials') 
                      : (lang === 'zh' ? `已选 ${selectedMaterialIds.length} 本` : `${selectedMaterialIds.length} selected`)}
                  </button>
                  
                  <AnimatePresence>
                    {showMaterialDropdown && (
                      <motion.div 
                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 10, scale: 0.95 }}
                        className="absolute right-0 top-full mt-2 w-56 bg-zinc-900 border border-white/10 rounded-xl shadow-2xl z-50 p-2 flex flex-col gap-1 max-h-64 overflow-y-auto custom-scrollbar backdrop-blur-xl"
                      >
                        <div className="px-2 py-1.5 mb-1 border-b border-white/5 flex items-center justify-between">
                          <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
                            {lang === 'zh' ? '选择关联素材' : 'Select Materials'}
                          </span>
                          <button 
                            onClick={() => setSelectedMaterialIds(selectedMaterialIds.length === materials.length ? [] : materials.map(b => b.id))}
                            className="text-[10px] text-blue-400 hover:text-blue-300"
                          >
                            {selectedMaterialIds.length === materials.length ? (lang === 'zh' ? '取消全选' : 'Deselect All') : (lang === 'zh' ? '全选' : 'Select All')}
                          </button>
                        </div>
                        
                        {/* Render Groups */}
                        {groups.map(group => {
                          const groupBooks = materials.filter(b => b.groupId === group.id);
                          if (groupBooks.length === 0) return null;
                          const allGroupSelected = groupBooks.every(b => selectedMaterialIds.includes(b.id));
                          
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
                                      setSelectedMaterialIds(prev => prev.filter(id => !groupBooks.find(b => b.id === id)));
                                    } else {
                                      const newIds = [...selectedMaterialIds];
                                      groupBooks.forEach(b => {
                                        if (!newIds.includes(b.id)) newIds.push(b.id);
                                      });
                                      setSelectedMaterialIds(newIds);
                                    }
                                  }}
                                  className="text-[9px] text-zinc-500 hover:text-white"
                                >
                                  {allGroupSelected ? (lang === 'zh' ? '取消' : 'None') : (lang === 'zh' ? '全选' : 'All')}
                                </button>
                              </div>
                              {groupBooks.map(book => {
                                const isSelected = selectedMaterialIds.includes(book.id);
                                return (
                                  <button
                                    key={book.id}
                                    onClick={() => {
                                      if (isSelected) {
                                        setSelectedMaterialIds(prev => prev.filter(id => id !== book.id));
                                      } else {
                                        setSelectedMaterialIds(prev => [...prev, book.id]);
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

                        {/* Render Ungrouped */}
                        {materials.filter(b => !b.groupId).length > 0 && (
                          <div className="mb-2">
                            <div className="flex items-center justify-between px-2 py-1 mb-1">
                              <span className="text-[10px] font-bold text-zinc-400 flex items-center gap-1">
                                <Folder className="w-3 h-3" />
                                {lang === 'zh' ? '未分组' : 'Ungrouped'}
                              </span>
                              <button 
                                onClick={() => {
                                  const ungroupedBooks = materials.filter(b => !b.groupId);
                                  const allUngroupedSelected = ungroupedBooks.every(b => selectedMaterialIds.includes(b.id));
                                  if (allUngroupedSelected) {
                                    setSelectedMaterialIds(prev => prev.filter(id => !ungroupedBooks.find(b => b.id === id)));
                                  } else {
                                    const newIds = [...selectedMaterialIds];
                                    ungroupedBooks.forEach(b => {
                                      if (!newIds.includes(b.id)) newIds.push(b.id);
                                    });
                                    setSelectedMaterialIds(newIds);
                                  }
                                }}
                                className="text-[9px] text-zinc-500 hover:text-white"
                              >
                                {materials.filter(b => !b.groupId).every(b => selectedMaterialIds.includes(b.id)) ? (lang === 'zh' ? '取消' : 'None') : (lang === 'zh' ? '全选' : 'All')}
                              </button>
                            </div>
                            {materials.filter(b => !b.groupId).map(book => {
                              const isSelected = selectedMaterialIds.includes(book.id);
                              return (
                                <button
                                  key={book.id}
                                  onClick={() => {
                                    if (isSelected) {
                                      setSelectedMaterialIds(prev => prev.filter(id => id !== book.id));
                                    } else {
                                      setSelectedMaterialIds(prev => [...prev, book.id]);
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
              {isAdmin && (
                <button 
                  onClick={onManageMaterials}
                  className="flex items-center gap-2 px-3 py-1.5 bg-white/10 hover:bg-white/20 border border-white/10 rounded-xl text-xs text-zinc-300 hover:text-white transition-all active:scale-95"
                >
                  <Book className="w-3.5 h-3.5" />
                  {lang === 'zh' ? '管理素材' : 'Manage Materials'}
                </button>
              )}
            </div>
          </div>
          {materials.length === 0 ? (
            <p className="text-xs text-zinc-400">
              {lang === 'zh' ? '请点击上方“管理素材”上传素材书' : 'Please click "Manage Materials" above to upload material books'}
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {materials.filter(m => selectedMaterialIds.includes(m.id)).map(m => (
                <span key={m.id} className="px-3 py-1 bg-white/10 rounded-full text-xs text-zinc-300 border border-white/5">
                  {m.name}
                </span>
              ))}
              {selectedMaterialIds.length === 0 && (
                <span className="text-xs text-zinc-500 italic">
                  {lang === 'zh' ? '未选择任何素材书' : 'No material books selected'}
                </span>
              )}
            </div>
          )}
        </div>

        <div className="bg-white/5 border border-white/10 rounded-2xl p-4 flex flex-col gap-4">
          <div className="relative">
            <textarea
              value={topic}
              onChange={e => setTopic(e.target.value)}
              placeholder={lang === 'zh' ? '输入作文题...' : 'Enter essay topic...'}
              className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-white/30 resize-none min-h-[100px]"
            />
          </div>
          
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleFileUpload} 
              accept="image/*" 
              className="hidden" 
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center justify-center gap-2 px-4 py-2.5 bg-white/10 hover:bg-white/20 rounded-xl text-sm text-white transition-colors border border-white/10"
            >
              <Camera className="w-4 h-4" />
              {lang === 'zh' ? '拍照/传图' : 'Upload Image'}
            </button>
            {image && (
              <div className="flex items-center justify-between gap-2 text-xs text-emerald-400 bg-emerald-400/10 px-3 py-2.5 rounded-xl border border-emerald-400/20">
                <div className="flex items-center gap-2">
                  <Check className="w-4 h-4" />
                  {lang === 'zh' ? '已上传图片' : 'Image uploaded'}
                </div>
                <button onClick={() => setImage(null)} className="ml-2 text-emerald-400 hover:text-emerald-300 p-1">
                  ×
                </button>
              </div>
            )}
            <div className="hidden sm:block flex-1"></div>
            <button
              onClick={handleGenerate}
              disabled={loading || (!topic.trim() && !image) || materials.length === 0}
              className="flex items-center justify-center gap-2 px-6 py-2.5 bg-white text-black hover:bg-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl text-sm font-bold transition-all shadow-[0_0_20px_rgba(255,255,255,0.3)] active:scale-95"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              {lang === 'zh' ? '生成素材' : 'Generate'}
            </button>
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>
      </div>

      {(result || loading) && (
        <div className="flex-1 flex flex-col min-h-0 bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
          <div className="flex-1 overflow-y-auto p-4 md:p-6 custom-scrollbar">
            {loading && !result ? (
              <div className="flex flex-col items-center justify-center h-full gap-4 text-zinc-400">
                <Loader2 className="w-8 h-8 animate-spin" />
                <p className="text-sm">{lang === 'zh' ? '正在翻阅素材书并提取素材...' : 'Extracting materials...'}</p>
              </div>
            ) : (
              <>
                <div className="prose prose-invert prose-sm max-w-none markdown-body">
                  <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks, remarkMath]} rehypePlugins={[rehypeKatex]}>
                    {formatContent(result)}
                  </ReactMarkdown>
                </div>
                
                {chatHistory.length > 0 && (
                  <div className="mt-8 space-y-8 border-t border-white/10 pt-8">
                    {chatHistory.map((msg, idx) => (
                      <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        {msg.role === 'user' ? (
                          <div className="max-w-[85%] rounded-2xl px-5 py-3 bg-white/10 text-zinc-100 border border-white/20 backdrop-blur-md shadow-lg">
                            <div className="prose prose-invert prose-sm max-w-none markdown-body">
                              <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks, remarkMath]} rehypePlugins={[rehypeKatex]}>
                                {formatContent(msg.text)}
                              </ReactMarkdown>
                            </div>
                          </div>
                        ) : (
                          <div className="w-full">
                            <div className="prose prose-invert prose-sm max-w-none markdown-body">
                              <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks, remarkMath]} rehypePlugins={[rehypeKatex]}>
                                {formatContent(msg.text)}
                              </ReactMarkdown>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {isChatting && chatHistory[chatHistory.length - 1]?.role === 'user' && (
                  <div className="flex justify-start mt-8">
                    <div className="flex items-center gap-3 text-zinc-400">
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span className="text-sm">{lang === 'zh' ? '思考中...' : 'Thinking...'}</span>
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} className="h-4" />
              </>
            )}
          </div>
          
          {result && !loading && (
            <div className="p-3 md:p-4 bg-black/40 border-t border-white/10 shrink-0">
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-zinc-400 flex items-center gap-1.5">
                    <MessageSquare className="w-3.5 h-3.5" />
                    {lang === 'zh' ? '继续追问' : 'Follow-up Questions'}
                  </span>
                  <select
                    value={chatModel}
                    onChange={(e) => setChatModel(e.target.value)}
                    className="bg-zinc-900 border border-zinc-700 text-zinc-300 text-xs rounded-lg px-2 py-1.5 focus:outline-none focus:border-zinc-500 transition-colors"
                  >
                    <option value="gemini-3.1-pro-preview">Gemini 3.1 Pro (Advanced)</option>
                    <option value="gemini-3-flash-preview">Gemini 3 Flash (Deep Thinking)</option>
                    <option value="gemini-3.1-flash-lite-preview">Gemini 3.1 Flash Lite (Fast)</option>
                  </select>
                </div>
                <div className="flex items-end gap-2">
                  <textarea
                    value={chatInput}
                    onChange={e => setChatInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleChatSubmit();
                      }
                    }}
                    placeholder={lang === 'zh' ? '输入你的问题 (Enter 发送)...' : 'Ask a question (Enter to send)...'}
                    className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-white/30 resize-none min-h-[44px] max-h-[120px] custom-scrollbar"
                    rows={1}
                  />
                  <button
                    onClick={handleChatSubmit}
                    disabled={isChatting || !chatInput.trim()}
                    className="p-2.5 bg-white text-black hover:bg-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl transition-colors shrink-0 h-[44px] w-[44px] flex items-center justify-center"
                  >
                    {isChatting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
