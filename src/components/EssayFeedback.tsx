import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenAI, Type, ThinkingLevel } from '@google/genai';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, X, Edit2, Download, FileText, File, FileCode, AlertCircle, Sparkles, ChevronRight, ChevronLeft, Upload, Image as ImageIcon, Trash2, Folder, Book, History, Undo2, Redo2, Clock } from 'lucide-react';
import { Textbook, TextbookGroup } from './TextbookManager';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

interface Annotation {
  id: string;
  start_index: number;
  end_index: number;
  text: string;
  type: 'grammar' | 'vocabulary' | 'structure' | 'content' | 'style';
  short_comment: string;
  suggestion: string;
  severity: 'low' | 'medium' | 'high';
  accepted?: boolean;
  rejected?: boolean;
}

interface Summary {
  score: number | string;
  grade?: string;
  overall_comment: string;
  next_steps: string[];
  detected_prompt?: string;
  detected_essay?: string;
}

interface ImageFile {
  file: File;
  url: string;
  base64: string;
  mimeType: string;
}

export function EssayFeedback({ lang, onSaveHistory, initialData, materials = [], groups = [], onManageMaterials, selectedModel = 'gemini-3-flash-preview' }: { 
  lang: 'zh' | 'en',
  onSaveHistory?: (module: string, summary: string, content: any) => void,
  initialData?: any,
  materials?: Textbook[],
  groups?: TextbookGroup[],
  onManageMaterials?: () => void,
  selectedModel?: string
}) {
  const [essay, setEssay] = useState('');
  const [essayImages, setEssayImages] = useState<ImageFile[]>([]);
  const [refImages, setRefImages] = useState<ImageFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [activeAnnotationId, setActiveAnnotationId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'input' | 'canvas'>('input');
  const [selectedMaterialIds, setSelectedMaterialIds] = useState<string[]>([]);
  const [showMaterialDropdown, setShowMaterialDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [editingParaIndex, setEditingParaIndex] = useState<number | null>(null);
  const [paraAiInput, setParaAiInput] = useState('');
  const [tempParaText, setTempParaText] = useState('');
  const [isParaAiLoading, setIsParaAiLoading] = useState(false);
  const [hoveredParaIndex, setHoveredParaIndex] = useState<number | null>(null);
  const [activeParaIndex, setActiveParaIndex] = useState<number | null>(null);
  const [paraAiModel, setParaAiModel] = useState(selectedModel);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setParaAiModel(selectedModel);
  }, [selectedModel]);

  // History State
  const [historyStack, setHistoryStack] = useState<Array<{ essay: string, annotations: Annotation[] }>>([]);
  const [historyPointer, setHistoryPointer] = useState(-1);
  const [historyLog, setHistoryLog] = useState<Array<{ id: string, paraIndex: number, oldParaText: string, newParaText: string, label: string, timestamp: number, type: 'annotation' | 'paragraph' }>>([]);
  const [showHistoryPanel, setShowHistoryPanel] = useState(false);

  // Global Chat State
  const [globalChatInput, setGlobalChatInput] = useState('');
  const [globalChatHistory, setGlobalChatHistory] = useState<Array<{ role: 'user' | 'model', text: string }>>([]);
  const [isGlobalChatLoading, setIsGlobalChatLoading] = useState(false);
  const [globalChatModel, setGlobalChatModel] = useState(selectedModel);

  useEffect(() => {
    setGlobalChatModel(selectedModel);
  }, [selectedModel]);

  const pushToHistory = (newEssay: string, newAnnotations: Annotation[]) => {
    const newState = { essay: newEssay, annotations: [...newAnnotations] };
    const newStack = historyStack.slice(0, historyPointer + 1);
    newStack.push(newState);
    setHistoryStack(newStack);
    setHistoryPointer(newStack.length - 1);
  };

  const undo = () => {
    if (historyPointer > 0) {
      const prevState = historyStack[historyPointer - 1];
      setEssay(prevState.essay);
      setAnnotations(prevState.annotations);
      setHistoryPointer(historyPointer - 1);
    }
  };

  const redo = () => {
    if (historyPointer < historyStack.length - 1) {
      const nextState = historyStack[historyPointer + 1];
      setEssay(nextState.essay);
      setAnnotations(nextState.annotations);
      setHistoryPointer(historyPointer + 1);
    }
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.paragraph-container')) {
        setActiveParaIndex(null);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  useEffect(() => {
    if (editingParaIndex !== null && textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
    }
  }, [editingParaIndex]);

  useEffect(() => {
    if (initialData) {
      const loadedEssay = initialData.essay || (initialData.summary && initialData.summary.detected_essay) || '';
      const loadedAnnotations = initialData.annotations || [];
      
      setEssay(loadedEssay);
      setAnnotations(loadedAnnotations);
      setSummary(initialData.summary || null);
      if (initialData.selectedMaterialIds) {
        setSelectedMaterialIds(initialData.selectedMaterialIds);
      }
      if (initialData.annotations && initialData.annotations.length > 0) {
        setViewMode('canvas');
      }

      const fetchImages = async (urls: string[]) => {
        return Promise.all(urls.map(async url => {
          try {
            const res = await fetch(url);
            const blob = await res.blob();
            const base64 = await new Promise<string>((resolve) => {
              const reader = new FileReader();
              reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
              reader.readAsDataURL(blob);
            });
            return { url, base64, mimeType: blob.type, file: new window.File([blob], 'image.jpg', { type: blob.type }) };
          } catch (e) {
            return { url, base64: '', mimeType: 'image/jpeg', file: new window.File([], 'image.jpg') };
          }
        }));
      };
      
      if (initialData.refImageUrls) {
        fetchImages(initialData.refImageUrls).then(setRefImages);
      }
      if (initialData.essayImageUrls) {
        fetchImages(initialData.essayImageUrls).then(setEssayImages);
      }

      // Initialize history stack for loaded data
      setHistoryStack([{ essay: loadedEssay, annotations: loadedAnnotations }]);
      setHistoryPointer(0);
      setHistoryLog([]);
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

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: 'essay' | 'ref') => {
    const files = Array.from(e.target.files || []);
    const newImages = await Promise.all(files.map(async file => {
      const url = URL.createObjectURL(file);
      const base64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
        reader.readAsDataURL(file);
      });
      return { file, url, base64, mimeType: file.type };
    }));
    
    if (type === 'essay') {
      setEssayImages(prev => [...prev, ...newImages]);
    } else {
      setRefImages(prev => [...prev, ...newImages]);
    }
  };

  const removeImage = (index: number, type: 'essay' | 'ref') => {
    if (type === 'essay') {
      setEssayImages(prev => prev.filter((_, i) => i !== index));
    } else {
      setRefImages(prev => prev.filter((_, i) => i !== index));
    }
  };

  const uploadToImageKit = async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      if (res.ok) {
        const data = await res.json();
        return data.url;
      }
    } catch (e) {
      console.error('Failed to upload image', e);
    }
    return null;
  };

  const handleGrade = async () => {
    if (!essay.trim() && essayImages.length === 0) {
      setError(lang === 'zh' ? '请输入作文内容或上传作文图片' : 'Please enter essay content or upload images');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const systemPromptZh = `你是一位资深的北京高考作文阅卷专家。你的任务是根据提供的**评分标准文档**和**关联素材**，对学生的作文进行极度细致、全方位的深度批改：

1. **自动识别与区分**：学生可能会将“作文题目/要求”和“作文正文”一起粘贴在输入框中。**请务必首先自动识别并区分这两部分**。
2. **深度对标标准**：请仔细研读上传的评分标准（PDF或图片），严格按照北京高考作文的评价维度（如：切题、中心、内容、结构、语言、字迹等）进行打分和评价。
3. **强化宏观评价（重点）**：**请务必从整体行文逻辑、段落间的层次关系、论点展开的连贯性等方面进行深度剖析**。在总体评语中，应重点评价文章的“骨架”是否稳健，逻辑是否自洽。
4. **微观精准批改**：精准捕捉每一个语法错误、用词不当、标点误用或表达生硬之处。
5. **详尽批注**：尽可能多地提出修改建议。不要只关注错误，也要针对可以优化得更好的地方提出“锦上添花”的建议。
6. **输出要求**：
   - 识别问题（语法、词汇、结构、内容、文体）。
   - 针对每个点，提供专业评语和具体的修改建议。
   - 输出结构化的 JSON 数组，包含：start_index, end_index, text, type, short_comment, suggestion, severity (low/medium/high)。
   - **特别注意**：'text' 字段必须**完全匹配**学生作文中的原始文本（包括标点和空格），因为它是定位修改位置的关键锚点。
   - 'suggestion' 字段必须是**直接用于替换原文本的精准修改后文本**，不要包含解释。
7. **深度总结**：给出一个深刻的总结，包含评分（参考标准给分）、等级，并给出极具指导意义的改进步骤。同时，在 summary 对象中返回识别出的 'detected_prompt' (题目要求) 和 'detected_essay' (作文正文)。`;

      const systemPromptEn = `You are an expert examiner for the Beijing Gaokao English essay. Your task is to provide an extremely detailed and comprehensive evaluation based on the provided **Grading Standards** and **Reference Materials**:

1. **Auto-Detection**: The student might paste both the "Essay Prompt/Requirements" and the "Essay Content" together. **You must automatically identify and separate these two parts.**
2. **Strict Adherence to Standards**: Deeply analyze the uploaded grading criteria. Evaluate the essay across all dimensions (Content, Organization, Range and Accuracy of Language, etc.).
3. **Focus on Macro Evaluation (Priority)**: **You must provide a deep analysis of the overall writing logic, hierarchical relationships between paragraphs, and the coherence of argument development.** In the overall comment, focus on evaluating whether the essay's "skeleton" is robust and logically consistent.
4. **Micro Precision**: Catch every grammatical error, awkward phrasing, or vocabulary misuse.
5. **Exhaustive Annotations**: Provide as many constructive suggestions as possible. Don't just fix errors; suggest ways to elevate the writing to a higher band.
6. **Output Format**:
   - Structured JSON array of annotations: start_index, end_index, text, type, short_comment, suggestion, severity.
   - The 'suggestion' field must contain ONLY the replacement text.
7. **In-depth Summary**: Provide a professional summary with a score (based on the standards), grade, and prioritized actionable next steps. Also, include 'detected_prompt' and 'detected_essay' in the summary object.`;

      const userPromptZh = `背景：学生为高中生，准备参加北京高考。
请严格输出仅包含两部分：
1) 一个名为 "annotations" 的 JSON 数组，包含注释对象。**请务必提供尽可能详尽的批改，数量不限，覆盖宏观逻辑与微观表达**；
2) 一个名为 "summary" 的对象，包含总体评语、评分、改进优先级，以及**自动识别出的题目要求 (detected_prompt) 和作文正文 (detected_essay)**。
每个注释对象格式示例：
{ "start_index": 123, "end_index": 130, "text": "原文片段", "type": "grammar", "short_comment": "主谓不一致，应该使用复数形式。", "suggestion": "are", "severity": "high" }
不要输出任何额外说明或多余文本，除非明确要求例外。`;

      const userPromptEn = `Context: The student is a high schooler preparing for the Beijing Gaokao.
Strict output: only two top-level fields: "annotations" (array) and "summary" (object). **The "summary" object must include "detected_prompt" and "detected_essay" identified from the input.**`;

      const parts: any[] = [];
      parts.push({ text: lang === 'zh' ? systemPromptZh : systemPromptEn });

      // Add selected materials
      if (selectedMaterialIds.length > 0) {
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
            console.error(`Failed to load material ${material.name}:`, err);
          }
        }
        parts.push({ text: lang === 'zh' ? "【关联素材书】请参考上述提供的素材书内容，在批改和建议中，如果合适，可以引用素材书中的例子或名言来丰富学生的作文。" : "[Associated Material Books] Please refer to the provided material books above. In your feedback and suggestions, if appropriate, quote examples or quotes from the material books to enrich the student's essay." });
      }

      if (refImages.length > 0) {
        parts.push({ text: lang === 'zh' ? "【参考文献/题目要求】" : "[References / Prompt Requirements]" });
        refImages.forEach(img => parts.push({ inlineData: { data: img.base64, mimeType: img.mimeType } }));
      }

      parts.push({ text: (lang === 'zh' ? "【学生作文文本】\n" : "[Student Essay Text]\n") + essay });
      
      if (essayImages.length > 0) {
        parts.push({ text: lang === 'zh' ? "【学生作文图片】" : "[Student Essay Images]" });
        essayImages.forEach(img => parts.push({ inlineData: { data: img.base64, mimeType: img.mimeType } }));
      }

      parts.push({ text: lang === 'zh' ? userPromptZh : userPromptEn });

      const response = await ai.models.generateContent({
        model: selectedModel,
        contents: [{ role: 'user', parts }],
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH },
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              annotations: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    start_index: { type: Type.INTEGER },
                    end_index: { type: Type.INTEGER },
                    text: { type: Type.STRING },
                    type: { type: Type.STRING },
                    short_comment: { type: Type.STRING },
                    suggestion: { type: Type.STRING },
                    severity: { type: Type.STRING }
                  },
                  required: ['start_index', 'end_index', 'text', 'type', 'short_comment', 'suggestion', 'severity']
                }
              },
              summary: {
                type: Type.OBJECT,
                properties: {
                  score: { type: Type.STRING },
                  grade: { type: Type.STRING },
                  overall_comment: { type: Type.STRING },
                  next_steps: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING }
                  },
                  detected_prompt: { type: Type.STRING },
                  detected_essay: { type: Type.STRING }
                },
                required: ['score', 'overall_comment', 'next_steps', 'detected_prompt', 'detected_essay']
              }
            },
            required: ['annotations', 'summary']
          }
        }
      });

      const resultText = response.text || '{}';
      const parsed = JSON.parse(resultText);
      
      const finalEssay = (parsed.summary?.detected_essay && (!essay || essay.trim() === "")) 
        ? parsed.summary.detected_essay 
        : essay;

      // Fix indices based on text field with more robust matching
      const rawAnnotations = parsed.annotations || [];
      const fixedAnnotations = rawAnnotations.map((ann: any) => {
        const expectedText = ann.text;
        if (!expectedText) return null;

        // 1. Try exact match at provided indices
        const actualAtIndices = finalEssay.substring(ann.start_index, ann.end_index);
        if (actualAtIndices === expectedText) return ann;
        
        // 2. Try searching in a window around the indices
        const windowSize = 500;
        const searchStart = Math.max(0, ann.start_index - windowSize);
        const searchEnd = Math.min(finalEssay.length, ann.end_index + windowSize);
        const searchArea = finalEssay.substring(searchStart, searchEnd);
        
        let foundIndex = searchArea.indexOf(expectedText);
        if (foundIndex !== -1) {
          const newStart = searchStart + foundIndex;
          return {
            ...ann,
            start_index: newStart,
            end_index: newStart + expectedText.length
          };
        }

        // 3. Try global search if window fails
        foundIndex = finalEssay.indexOf(expectedText);
        if (foundIndex !== -1) {
          return {
            ...ann,
            start_index: foundIndex,
            end_index: foundIndex + expectedText.length
          };
        }

        // 4. Try normalized search (ignore extra whitespace)
        const normalize = (s: string) => s.replace(/\s+/g, ' ').trim();
        const normalizedExpected = normalize(expectedText);
        
        // Search for normalized text in normalized essay (this is slow but a last resort)
        // For now, let's just try to find the first 15 chars as a fallback
        if (expectedText.length > 15) {
          const head = expectedText.substring(0, 15);
          const headIndex = finalEssay.indexOf(head, searchStart);
          if (headIndex !== -1) {
            // Find the end by looking for the last 10 chars
            const tail = expectedText.substring(expectedText.length - 10);
            const tailIndex = finalEssay.indexOf(tail, headIndex);
            if (tailIndex !== -1 && tailIndex - headIndex < expectedText.length + 100) {
              return {
                ...ann,
                start_index: headIndex,
                end_index: tailIndex + tail.length,
                text: finalEssay.substring(headIndex, tailIndex + tail.length)
              };
            }
          }
        }

        console.warn('Could not find text for annotation:', expectedText);
        return null; 
      }).filter(Boolean);

      const annotationsWithIds = fixedAnnotations.map((a: any, i: number) => ({
        ...a,
        id: 'a' + i + '_' + Date.now(),
        accepted: false,
        rejected: false
      }));

      setAnnotations(annotationsWithIds);
      setSummary(parsed.summary || null);
      
      if (finalEssay !== essay) {
        setEssay(finalEssay);
      }
      
      setViewMode('canvas');

      // Initialize history
      setHistoryStack([{ essay: finalEssay, annotations: annotationsWithIds }]);
      setHistoryPointer(0);
      setHistoryLog([]);

      if (onSaveHistory) {
        // We can upload images to ImageKit in the background for history
        const uploadedRefUrls = await Promise.all(refImages.map(img => uploadToImageKit(img.file)));
        const uploadedEssayUrls = await Promise.all(essayImages.map(img => uploadToImageKit(img.file)));
        
        onSaveHistory('essay-feedback', lang === 'zh' ? '作文讲评' : 'Essay Feedback', {
          essay: finalEssay,
          annotations: annotationsWithIds,
          summary: parsed.summary,
          refImageUrls: uploadedRefUrls.filter(url => url !== null),
          essayImageUrls: uploadedEssayUrls.filter(url => url !== null)
        });
      }

    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to grade essay');
    } finally {
      setLoading(false);
    }
  };

  const handleAccept = (id: string) => {
    const ann = annotations.find(a => a.id === id);
    if (!ann) return;

    const oldText = essay;
    const paragraphs = oldText.split('\n');
    
    // Find paragraph index
    let currentPos = 0;
    let paraIndex = 0;
    for (let i = 0; i < paragraphs.length; i++) {
      const nextPos = currentPos + paragraphs[i].length + 1;
      if (ann.start_index >= currentPos && ann.start_index < nextPos) {
        paraIndex = i;
        break;
      }
      currentPos = nextPos;
    }

    const oldParaText = paragraphs[paraIndex];
    const newText = oldText.substring(0, ann.start_index) + ann.suggestion + oldText.substring(ann.end_index);
    const diffLength = ann.suggestion.length - (ann.end_index - ann.start_index);

    const updatedAnnotations = annotations.filter(a => {
      if (a.id === id) return false;
      const isOverlapping = (a.start_index < ann.end_index && a.end_index > ann.start_index);
      return !isOverlapping;
    }).map(a => {
      if (a.start_index >= ann.end_index) {
        return { ...a, start_index: a.start_index + diffLength, end_index: a.end_index + diffLength };
      }
      return a;
    });

    const newParagraphs = newText.split('\n');
    const newParaText = newParagraphs[paraIndex];

    setEssay(newText);
    setAnnotations(updatedAnnotations);
    setActiveAnnotationId(null);

    // Record History
    pushToHistory(newText, updatedAnnotations);
    setHistoryLog(prev => [{
      id: 'log_' + Date.now(),
      paraIndex,
      oldParaText,
      newParaText,
      label: ann.short_comment,
      timestamp: Date.now(),
      type: 'annotation'
    }, ...prev]);
  };

  const handleReject = (id: string) => {
    setAnnotations(prev => prev.filter(a => a.id !== id));
    setActiveAnnotationId(null);
  };

  const getHighlightColor = (type: string) => {
    if (type === 'grammar') return 'bg-red-500/30';
    if (type === 'vocabulary') return 'bg-blue-500/30';
    if (type === 'structure') return 'bg-purple-500/30';
    return 'bg-emerald-500/30';
  };

  const renderAnnotatedText = () => {
    if (!essay) return null;

    // Try to find where the actual essay starts if we have detected_essay
    let displayEssay = essay;
    let indexOffset = 0;
    
    if (summary?.detected_essay) {
      const essayStart = essay.indexOf(summary.detected_essay);
      if (essayStart !== -1) {
        displayEssay = essay.substring(essayStart);
        indexOffset = essayStart;
      }
    }

    const paragraphs = displayEssay.split('\n');
    let currentGlobalIndex = indexOffset;

    return (
      <div className="space-y-6">
        {paragraphs.map((paraText, paraIndex) => {
          const paraStart = currentGlobalIndex;
          const paraEnd = paraStart + paraText.length;
          currentGlobalIndex = paraEnd + 1;

          if (!paraText.trim() && paraIndex !== paragraphs.length - 1) return <div key={paraIndex} className="h-4" />;
          if (!paraText.trim()) return null;

          const paraAnnotations = annotations.filter(
            ann => ann.start_index >= paraStart && ann.end_index <= paraEnd
          );

          return (
            <div 
              key={paraIndex} 
              className={`paragraph-container relative group/para transition-all duration-300 ${editingParaIndex === paraIndex ? 'bg-white/[0.02] border border-white/10 rounded-2xl p-6 -mx-6 my-4 shadow-2xl shadow-black/50' : ''}`}
              onMouseEnter={() => setHoveredParaIndex(paraIndex)}
              onMouseLeave={() => setHoveredParaIndex(null)}
              onClick={(e) => {
                if (editingParaIndex !== paraIndex) {
                  setActiveParaIndex(paraIndex);
                }
              }}
            >
              <div className={editingParaIndex === paraIndex ? '' : 'pr-12'}>
                {editingParaIndex === paraIndex ? (
                  <textarea 
                    ref={textareaRef}
                    value={tempParaText}
                    onChange={(e) => {
                      setTempParaText(e.target.value);
                      e.target.style.height = 'auto';
                      e.target.style.height = e.target.scrollHeight + 'px';
                    }}
                    className="w-full min-h-[1.5em] bg-transparent border-none text-white text-base leading-relaxed focus:ring-0 outline-none resize-none font-sans p-0 m-0 overflow-hidden"
                    autoFocus
                  />
                ) : (
                  renderParagraphContent(paraText, paraStart, paraAnnotations)
                )}
              </div>
              
              {editingParaIndex !== paraIndex && (
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditingParaIndex(paraIndex);
                    setTempParaText(paraText);
                    setParaAiInput('');
                    setActiveParaIndex(null);
                  }}
                  className={`absolute right-0 top-1/2 -translate-y-1/2 p-2 bg-white/5 hover:bg-white/10 rounded-lg transition-all duration-200 ${
                    (hoveredParaIndex === paraIndex || activeParaIndex === paraIndex) 
                      ? 'opacity-100 translate-x-0' 
                      : 'opacity-0 translate-x-2'
                  }`}
                >
                  <ChevronRight className="w-5 h-5 text-white/40 hover:text-white" />
                </button>
              )}

              {/* Inline Paragraph Editor */}
              <AnimatePresence>
                {editingParaIndex === paraIndex && (
                  <motion.div 
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden w-full"
                  >
                    <div className="my-6 bg-[#2A2A2A] border border-white/10 rounded-2xl p-6 shadow-2xl flex flex-col gap-5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <h3 className="text-sm font-bold text-white/60 uppercase tracking-widest">{lang === 'zh' ? 'AI 优化指导' : 'AI Optimization'}</h3>
                          <select 
                            value={paraAiModel}
                            onChange={e => setParaAiModel(e.target.value)}
                            className="bg-black/40 border border-white/10 text-zinc-300 text-xs rounded-lg px-2 py-1 outline-none focus:ring-1 focus:ring-white"
                          >
                            <option value="gemini-3-flash-preview">Gemini 3.0 Flash</option>
                            <option value="gemini-3.1-flash-preview">Gemini 3.1 Flash</option>
                            <option value="gemini-3.1-pro-preview">Gemini 3.1 Pro</option>
                          </select>
                        </div>
                        <button onClick={() => setEditingParaIndex(null)} className="p-1 hover:bg-white/10 rounded-full transition-colors text-white/50 hover:text-white">
                          <X className="w-5 h-5" />
                        </button>
                      </div>

                      <div className="flex flex-col gap-2">
                        <label className="text-[10px] font-bold text-white/30 uppercase tracking-wider">
                          {lang === 'zh' ? '指导 AI 修改' : 'Guide AI Modification'}
                        </label>
                        <textarea 
                          value={paraAiInput}
                          onChange={(e) => setParaAiInput(e.target.value)}
                          placeholder={lang === 'zh' ? '例如：让这段话更有文学色彩，或者纠正逻辑问题...' : 'e.g., Make it more literary, or fix logical issues...'}
                          className="w-full h-40 bg-white/5 border border-white/10 rounded-xl p-4 text-white text-sm placeholder:text-white/20 focus:ring-1 focus:ring-emerald-500/50 outline-none resize-none transition-all"
                        />
                      </div>

                      <div className="flex gap-3">
                        <button 
                          onClick={() => handleManualParaSave(paraIndex)}
                          className="flex-1 py-3 bg-white/5 hover:bg-white/10 text-white rounded-xl font-medium transition-colors text-sm"
                        >
                          {lang === 'zh' ? '仅保存修改' : 'Save Only'}
                        </button>
                        <button 
                          onClick={() => handleParagraphAi(paraIndex)}
                          disabled={isParaAiLoading || !paraAiInput.trim()}
                          className="flex-[2] py-3 bg-white text-black hover:bg-white/90 disabled:bg-white/10 disabled:text-white/40 rounded-xl font-bold transition-all flex items-center justify-center gap-2 text-sm"
                        >
                          {isParaAiLoading ? (
                            <div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                          ) : (
                            <Sparkles className="w-4 h-4" />
                          )}
                          {lang === 'zh' ? '执行 AI 修改' : 'Apply AI Changes'}
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    );
  };

  const renderParagraphContent = (paraText: string, paraStart: number, paraAnnotations: Annotation[]) => {
    let result = [];
    let currentIndex = 0;

    const sortedAnnotations = [...paraAnnotations].sort((a, b) => a.start_index - b.start_index);
    
    for (const ann of sortedAnnotations) {
      const relativeStart = ann.start_index - paraStart;
      const relativeEnd = ann.end_index - paraStart;

      // Skip if this annotation starts before the current index (overlap guard)
      if (relativeStart < currentIndex) continue;

      if (relativeStart > currentIndex) {
        result.push(<span key={'text-' + currentIndex}>{paraText.substring(currentIndex, relativeStart)}</span>);
      }

      const isHovered = activeAnnotationId === ann.id;
      const highlightedText = paraText.substring(relativeStart, relativeEnd);
      const trimmedText = highlightedText.trim();
      
      if (!trimmedText) {
        result.push(<span key={ann.id}>{highlightedText}</span>);
      } else {
        const startOffset = highlightedText.indexOf(trimmedText);
        const leadingSpaces = highlightedText.substring(0, startOffset);
        const trailingSpaces = highlightedText.substring(startOffset + trimmedText.length);
        
        if (leadingSpaces) result.push(<span key={`leading-${ann.id}`}>{leadingSpaces}</span>);
        result.push(
          <span 
            key={ann.id} 
            className={'cursor-pointer transition-colors duration-200 rounded px-1 ' + getHighlightColor(ann.type) + ' ' + (isHovered ? 'bg-white/20 ring-2 ring-white/50' : 'hover:bg-white/20')}
            onClick={(e) => {
              e.stopPropagation();
              setActiveAnnotationId(activeAnnotationId === ann.id ? null : ann.id);
            }}
          >
            {trimmedText}
          </span>
        );
        if (trailingSpaces) result.push(<span key={`trailing-${ann.id}`}>{trailingSpaces}</span>);
      }
      
      if (isHovered) {
        result.push(
          <span key={`popup-${ann.id}`} className="block w-full my-3" contentEditable={false}>
            <motion.div 
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-[#2A2A2A] border border-white/10 rounded-2xl p-5 shadow-xl text-left text-base font-normal cursor-default flex flex-col gap-3 mx-auto max-w-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/10 text-white/80 border border-white/20 uppercase tracking-wider">
                  {ann.type}
                </span>
                <button onClick={(e) => { e.stopPropagation(); setActiveAnnotationId(null); }} className="p-1 hover:bg-white/10 rounded-full transition-colors text-white/50 hover:text-white">
                  <X className="w-4 h-4" />
                </button>
              </div>
              
              <div className="text-sm font-medium text-white">{ann.short_comment}</div>
              
              <div className="bg-black/40 border border-white/5 rounded-xl p-3 flex flex-col gap-1">
                <div className="text-xs text-white/40 line-through">{paraText.substring(relativeStart, relativeEnd)}</div>
                <div className="text-sm text-emerald-400 font-medium">{ann.suggestion}</div>
              </div>

              <div className="flex gap-2 mt-1">
                <button 
                  onClick={(e) => { e.stopPropagation(); handleAccept(ann.id); }}
                  className="flex-1 py-2 bg-white text-black hover:bg-white/90 rounded-lg text-sm font-medium flex items-center justify-center gap-1.5 transition-colors"
                >
                  <Check className="w-3.5 h-3.5" /> {lang === 'zh' ? '采纳' : 'Accept'}
                </button>
                <button 
                  onClick={(e) => { e.stopPropagation(); handleReject(ann.id); }}
                  className="flex-1 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg text-sm font-medium flex items-center justify-center gap-1.5 transition-colors"
                >
                  <X className="w-3.5 h-3.5" /> {lang === 'zh' ? '忽略' : 'Reject'}
                </button>
              </div>
            </motion.div>
          </span>
        );
      }

      currentIndex = Math.max(currentIndex, relativeEnd);
    }

    if (currentIndex < paraText.length) {
      result.push(<span key={'text-' + currentIndex}>{paraText.substring(currentIndex)}</span>);
    }

    return result;
  };

  const updateEssayWithParagraph = (paraIndex: number, newParaText: string, label?: string) => {
    const paragraphs = essay.split('\n');
    const oldParaText = paragraphs[paraIndex];
    
    // Calculate start index of the paragraph in the full essay
    let paraStart = 0;
    for (let i = 0; i < paraIndex; i++) {
      paraStart += paragraphs[i].length + 1; // +1 for \n
    }
    
    const oldParaEnd = paraStart + oldParaText.length;
    const diffLength = newParaText.length - oldParaText.length;

    const updatedAnnotations = annotations.filter(ann => {
      const isInside = (ann.start_index >= paraStart && ann.start_index < oldParaEnd) || 
                       (ann.end_index > paraStart && ann.end_index <= oldParaEnd);
      return !isInside;
    }).map(ann => {
      if (ann.start_index >= oldParaEnd) {
        return {
          ...ann,
          start_index: ann.start_index + diffLength,
          end_index: ann.end_index + diffLength
        };
      }
      return ann;
    });

    const newEssay = paragraphs.map((p, i) => i === paraIndex ? newParaText : p).join('\n');
    setEssay(newEssay);
    setAnnotations(updatedAnnotations);

    // Record History
    pushToHistory(newEssay, updatedAnnotations);
    setHistoryLog(prev => [{
      id: 'log_' + Date.now(),
      paraIndex,
      oldParaText,
      newParaText,
      label: label || (lang === 'zh' ? '段落修改' : 'Paragraph Update'),
      timestamp: Date.now(),
      type: 'paragraph'
    }, ...prev]);
  };

  const handleManualParaSave = (paraIndex: number) => {
    updateEssayWithParagraph(paraIndex, tempParaText, lang === 'zh' ? '手动修改段落' : 'Manual Paragraph Edit');
    setEditingParaIndex(null);
  };

  const handleParagraphAi = async (paraIndex: number) => {
    if (!paraAiInput.trim()) return;
    setIsParaAiLoading(true);
    try {
      const response = await ai.models.generateContent({
        model: paraAiModel,
        contents: `你是一个专业的写作导师。请根据以下指令修改给定的段落。
指令：${paraAiInput}
原始段落：${tempParaText}

请直接返回修改后的段落内容，不要包含任何解释或多余的文字。`,
        config: {
          thinkingConfig: { thinkingLevel: paraAiModel.includes('flash') ? ThinkingLevel.LOW : ThinkingLevel.HIGH }
        }
      });
      
      const newParaText = response.text?.trim();
      if (newParaText) {
        updateEssayWithParagraph(paraIndex, newParaText, lang === 'zh' ? `AI修改: ${paraAiInput}` : `AI Edit: ${paraAiInput}`);
        setEditingParaIndex(null);
        setParaAiInput('');
      }
    } catch (err) {
      console.error('Paragraph AI Error:', err);
    } finally {
      setIsParaAiLoading(false);
    }
  };

  const revertHistoryItem = (logId: string) => {
    const item = historyLog.find(l => l.id === logId);
    if (!item) return;
    
    if (item.paraIndex === -1) {
      // Global revert
      setEssay(item.oldParaText);
      setAnnotations([]); // We don't have the old annotations stored in the log easily, but we can rely on undo stack
      pushToHistory(item.oldParaText, []);
      setHistoryLog(prev => [{
        id: 'log_' + Date.now(),
        paraIndex: -1,
        oldParaText: item.newParaText,
        newParaText: item.oldParaText,
        label: lang === 'zh' ? `恢复: ${item.label}` : `Revert: ${item.label}`,
        timestamp: Date.now(),
        type: 'paragraph'
      }, ...prev]);
    } else {
      // Restore the paragraph to its old state
      updateEssayWithParagraph(item.paraIndex, item.oldParaText, lang === 'zh' ? `恢复: ${item.label}` : `Revert: ${item.label}`);
    }
  };

  const handleGlobalChat = async () => {
    if (!globalChatInput.trim()) return;
    
    const userMessage = globalChatInput.trim();
    setGlobalChatHistory(prev => [...prev, { role: 'user', text: userMessage }]);
    setGlobalChatInput('');
    setIsGlobalChatLoading(true);

    try {
      const historyContext = globalChatHistory.map(msg => `${msg.role === 'user' ? 'User' : 'AI'}: ${msg.text}`).join('\n\n');
      
      const prompt = `你是一个专业的写作导师。当前学生的作文如下：
${essay}

当前的批改总结：
${summary?.overall_comment || '无'}

历史对话：
${historyContext}

用户的新要求/问题：
${userMessage}

请根据用户的要求回答问题或修改作文。
请返回 JSON 格式：
{
  "response_text": "你的回答或解释",
  "modified_essay": "如果用户要求修改整篇作文，请在这里输出修改后的完整作文。如果没有要求修改，请返回空字符串。"
}`;

      const response = await ai.models.generateContent({
        model: globalChatModel,
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              response_text: { type: Type.STRING },
              modified_essay: { type: Type.STRING, description: "如果用户要求修改整篇作文，请在这里输出修改后的完整作文。如果没有要求修改，请返回空字符串。" }
            },
            required: ['response_text', 'modified_essay']
          },
          thinkingConfig: { thinkingLevel: globalChatModel.includes('flash') ? ThinkingLevel.LOW : ThinkingLevel.HIGH }
        }
      });

      const resultText = response.text || '{}';
      const parsed = JSON.parse(resultText);

      setGlobalChatHistory(prev => [...prev, { role: 'model', text: parsed.response_text }]);

      if (parsed.modified_essay && parsed.modified_essay.trim() !== '') {
        const newEssay = parsed.modified_essay;
        const oldEssay = essay;
        setEssay(newEssay);
        setAnnotations([]);
        pushToHistory(newEssay, []);
        setHistoryLog(prev => [{
          id: 'log_' + Date.now(),
          paraIndex: -1,
          oldParaText: oldEssay,
          newParaText: newEssay,
          label: lang === 'zh' ? '全局 AI 修改' : 'Global AI Edit',
          timestamp: Date.now(),
          type: 'paragraph'
        }, ...prev]);
      }

    } catch (err) {
      console.error('Global Chat Error:', err);
      setGlobalChatHistory(prev => [...prev, { role: 'model', text: lang === 'zh' ? '抱歉，处理您的请求时出错。' : 'Sorry, an error occurred while processing your request.' }]);
    } finally {
      setIsGlobalChatLoading(false);
    }
  };

  const copyMarkdown = () => {
    let md = '# ' + (lang === 'zh' ? '作文讲评' : 'Essay Feedback') + '\n\n';
    
    if (summary) {
      md += '## ' + (lang === 'zh' ? '总结' : 'Summary') + '\n';
      md += '**' + (lang === 'zh' ? '评分' : 'Score') + '**: ' + summary.score + (summary.grade ? ' (' + summary.grade + ')' : '') + '\n\n';
      md += summary.overall_comment + '\n\n';
      md += '### ' + (lang === 'zh' ? '改进建议' : 'Next Steps') + '\n';
      summary.next_steps.forEach(step => md += '- ' + step + '\n');
      md += '\n---\n\n';
    }

    md += '## ' + (lang === 'zh' ? '批注正文' : 'Annotated Text') + '\n\n';
    
    let currentIndex = 0;
    const sortedAnnotations = [...annotations].sort((a, b) => a.start_index - b.start_index);
    const nonOverlappingAnnotations = [];
    let lastEnd = 0;
    for (const ann of sortedAnnotations) {
      if (ann.start_index >= lastEnd) {
        nonOverlappingAnnotations.push(ann);
        lastEnd = ann.end_index;
      }
    }
    
    for (const ann of nonOverlappingAnnotations) {
      if (ann.start_index > currentIndex) {
        md += essay.substring(currentIndex, ann.start_index);
      }
      md += '<mark title="' + ann.short_comment + ' -> ' + ann.suggestion + '">' + essay.substring(ann.start_index, ann.end_index) + '</mark>';
      currentIndex = Math.max(currentIndex, ann.end_index);
    }
    
    if (currentIndex < essay.length) {
      md += essay.substring(currentIndex);
    }

    navigator.clipboard.writeText(md).then(() => {
      alert(lang === 'zh' ? '已复制 Markdown 到剪贴板' : 'Markdown copied to clipboard');
    });
  };

  const copyText = () => {
    let text = '';
    let currentIndex = 0;
    const sortedAnnotations = [...annotations].sort((a, b) => a.start_index - b.start_index);
    const nonOverlappingAnnotations = [];
    let lastEnd = 0;
    for (const ann of sortedAnnotations) {
      if (ann.start_index >= lastEnd) {
        nonOverlappingAnnotations.push(ann);
        lastEnd = ann.end_index;
      }
    }
    
    for (const ann of nonOverlappingAnnotations) {
      if (ann.start_index > currentIndex) {
        text += essay.substring(currentIndex, ann.start_index);
      }
      text += essay.substring(ann.start_index, ann.end_index) + ' [' + ann.short_comment + ']';
      currentIndex = Math.max(currentIndex, ann.end_index);
    }
    
    if (currentIndex < essay.length) {
      text += essay.substring(currentIndex);
    }

    navigator.clipboard.writeText(text).then(() => {
      alert(lang === 'zh' ? '已复制文本到剪贴板' : 'Text copied to clipboard');
    });
  };

  const cleanUpEssay = () => {
    if (!summary?.detected_essay || !essay) return;
    
    const offset = essay.indexOf(summary.detected_essay);
    if (offset === -1) return;

    const newEssay = summary.detected_essay;
    const newAnnotations = annotations
      .filter(ann => ann.start_index >= offset)
      .map(ann => ({
        ...ann,
        start_index: ann.start_index - offset,
        end_index: ann.end_index - offset
      }));

    pushToHistory(newEssay, newAnnotations);
    setEssay(newEssay);
    setAnnotations(newAnnotations);
  };

  const exportAcceptedText = () => {
    let text = '';
    let currentIndex = 0;
    const sortedAnnotations = [...annotations].sort((a, b) => a.start_index - b.start_index);
    const nonOverlappingAnnotations = [];
    let lastEnd = 0;
    for (const ann of sortedAnnotations) {
      if (ann.start_index >= lastEnd) {
        nonOverlappingAnnotations.push(ann);
        lastEnd = ann.end_index;
      }
    }
    
    for (const ann of nonOverlappingAnnotations) {
      if (ann.start_index > currentIndex) {
        text += essay.substring(currentIndex, ann.start_index);
      }
      text += ann.suggestion;
      currentIndex = Math.max(currentIndex, ann.end_index);
    }
    
    if (currentIndex < essay.length) {
      text += essay.substring(currentIndex);
    }

    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'revised_essay.txt';
    a.click();
    URL.revokeObjectURL(url);
  };

  const activeAnnotation = annotations.find(a => a.id === activeAnnotationId);

  return (
    <div className="flex flex-col h-full bg-[#141414] text-white overflow-hidden relative">
      {viewMode === 'input' ? (
        <div className="flex-1 overflow-y-auto p-6 pt-10 max-w-4xl mx-auto w-full">
          <div className="mb-8 text-center">
            <h2 className="text-3xl font-bold mb-2">{lang === 'zh' ? '作文讲评 (北京高考)' : 'Essay Feedback'}</h2>
            <p className="text-white/60">{lang === 'zh' ? '支持文本与图片上传，AI 自动识别问题并提供修改建议' : 'Upload text or images, AI automatically identifies issues and provides suggestions'}</p>
          </div>

          <div className="space-y-6">
            {/* 关联资料 (Merged Materials and References) */}
            <div className="bg-white/5 border border-white/10 rounded-xl p-4">
              <div className="flex items-center justify-between mb-4 pb-4 border-b border-white/5">
                <div className="flex items-center gap-2">
                  <Book className={`w-5 h-5 transition-colors ${selectedMaterialIds.length > 0 || refImages.length > 0 ? 'text-emerald-400' : 'text-zinc-500'}`} />
                  <h3 className="text-sm font-bold text-white">
                    {lang === 'zh' ? '关联资料' : 'Associated Materials'}
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
                                        {isSelected && <Check className="w-3 h-3 text-emerald-400 shrink-0" />}
                                      </button>
                                    );
                                  })}
                                </div>
                              );
                            })}
                            
                            {/* Ungrouped Materials */}
                            {materials.filter(b => !b.groupId).length > 0 && (
                              <div className="mt-2 pt-2 border-t border-white/5">
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
                                      {isSelected && <Check className="w-3 h-3 text-emerald-400 shrink-0" />}
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
                  {onManageMaterials && (
                    <button 
                      onClick={onManageMaterials}
                      className="bg-white/10 hover:bg-white/20 text-white text-[10px] rounded-full px-3 py-1.5 transition-colors"
                    >
                      {lang === 'zh' ? '管理' : 'Manage'}
                    </button>
                  )}
                  <label className="cursor-pointer px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-full text-[10px] font-medium transition-colors flex items-center gap-1 border border-white/10">
                    <Upload className="w-3 h-3" />
                    {lang === 'zh' ? '上传参考图片' : 'Upload Ref'}
                    <input type="file" accept="image/*" multiple className="hidden" onChange={e => handleImageUpload(e, 'ref')} />
                  </label>
                </div>
              </div>

              <div className="space-y-4">
                {selectedMaterialIds.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {selectedMaterialIds.map(id => {
                      const material = materials.find(m => m.id === id);
                      if (!material) return null;
                      return (
                        <div key={id} className="px-2 py-1 bg-white/5 border border-white/10 rounded text-[10px] text-white/60 flex items-center gap-1">
                          <Book className="w-3 h-3" />
                          {material.name}
                        </div>
                      );
                    })}
                  </div>
                )}

                {refImages.length > 0 ? (
                  <div className="flex gap-2 overflow-x-auto pb-2">
                    {refImages.map((img, idx) => (
                      <div key={idx} className="relative w-16 h-16 shrink-0 rounded-lg overflow-hidden border border-white/20 group">
                        <img src={img.url} alt="ref" className="w-full h-full object-cover" />
                        <button onClick={() => removeImage(idx, 'ref')} className="absolute top-1 right-1 p-1 bg-black/60 rounded text-white opacity-0 group-hover:opacity-100 transition-opacity">
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  selectedMaterialIds.length === 0 && (
                    <div className="text-[10px] text-white/20 text-center py-4 border border-dashed border-white/5 rounded-lg">
                      {lang === 'zh' ? '暂无关联资料，可选择素材或上传题目截图' : 'No associated materials, select materials or upload prompt screenshots'}
                    </div>
                  )
                )}
              </div>
            </div>

            {/* Essay Images Upload */}
            <div className="bg-white/5 border border-white/10 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <label className="text-sm font-medium text-white/70 flex items-center gap-2">
                  <ImageIcon className="w-4 h-4" />
                  {lang === 'zh' ? '作文图片 (可选)' : 'Essay Images (Optional)'}
                </label>
                <label className="cursor-pointer px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-full text-[10px] font-medium transition-colors flex items-center gap-1 border border-white/10">
                  <Upload className="w-3 h-3" />
                  {lang === 'zh' ? '上传作文图片' : 'Upload Essay'}
                  <input type="file" accept="image/*" multiple className="hidden" onChange={e => handleImageUpload(e, 'essay')} />
                </label>
              </div>
              {essayImages.length > 0 ? (
                <div className="flex gap-2 overflow-x-auto pb-2">
                  {essayImages.map((img, idx) => (
                    <div key={idx} className="relative w-20 h-20 shrink-0 rounded-lg overflow-hidden border border-white/20 group">
                      <img src={img.url} alt="essay" className="w-full h-full object-cover" />
                      <button onClick={() => removeImage(idx, 'essay')} className="absolute top-1 right-1 p-1 bg-black/60 rounded text-white opacity-0 group-hover:opacity-100 transition-opacity">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-xs text-white/40 text-center py-4 border border-dashed border-white/10 rounded-lg">
                  {lang === 'zh' ? '暂无图片，可上传手写作文' : 'No images, upload handwritten essay'}
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-white/70 mb-1">{lang === 'zh' ? '作文正文' : 'Essay Content'}</label>
              <textarea 
                value={essay}
                onChange={e => setEssay(e.target.value)}
                placeholder={lang === 'zh' ? '在此粘贴你的作文...' : 'Paste your essay here...'}
                className="w-full h-64 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-white/30 resize-none"
              />
            </div>

            {error && (
              <div className="p-4 bg-white/10 border border-white/20 rounded-xl text-white flex items-start gap-3">
                <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                <p>{error}</p>
              </div>
            )}

            <button
              onClick={handleGrade}
              disabled={loading || (!essay.trim() && essayImages.length === 0)}
              className="w-full py-4 bg-white text-black hover:bg-white/90 disabled:bg-white/10 disabled:text-white/40 rounded-xl font-medium transition-colors flex items-center justify-center gap-2"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-black/30 border-t-black rounded-full animate-spin" />
              ) : (
                <Sparkles className="w-5 h-5" />
              )}
              {lang === 'zh' ? '开始批改' : 'Start Grading'}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col overflow-hidden relative">
          {/* Canvas Area */}
          <div className="flex-1 overflow-y-auto p-6 md:p-10">
            <div className="max-w-4xl mx-auto relative" id="feedback-container">
              <div className="w-full">
                <div className="flex items-center justify-between mb-6">
                  <button 
                    onClick={() => setViewMode('input')}
                    className="p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <div className="flex gap-2">
                    <div className="flex bg-white/5 rounded-lg border border-white/10 overflow-hidden">
                      <button 
                        onClick={undo} 
                        disabled={historyPointer <= 0}
                        className="p-1.5 hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent transition-colors border-r border-white/10"
                        title={lang === 'zh' ? '撤回' : 'Undo'}
                      >
                        <Undo2 className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={redo} 
                        disabled={historyPointer >= historyStack.length - 1}
                        className="p-1.5 hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent transition-colors border-r border-white/10"
                        title={lang === 'zh' ? '重做' : 'Redo'}
                      >
                        <Redo2 className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => setShowHistoryPanel(!showHistoryPanel)}
                        className={`p-1.5 hover:bg-white/10 transition-colors flex items-center gap-1.5 px-3 ${showHistoryPanel ? 'bg-white/10 text-emerald-400' : 'text-white/70'}`}
                      >
                        <History className="w-4 h-4" />
                        <span className="text-xs font-medium">{lang === 'zh' ? '历史记录' : 'History'}</span>
                      </button>
                    </div>

                    <button onClick={copyMarkdown} className="px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg transition-colors text-sm flex items-center gap-2">
                      <FileCode className="w-4 h-4" /> {lang === 'zh' ? '复制 Markdown' : 'Copy MD'}
                    </button>
                    <button onClick={copyText} className="px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg transition-colors text-sm flex items-center gap-2">
                      <FileText className="w-4 h-4" /> {lang === 'zh' ? '复制文本' : 'Copy Text'}
                    </button>
                  </div>
                </div>

                {/* History Section - Moved here, below buttons and above summary */}
                <AnimatePresence>
                  {showHistoryPanel && (
                    <motion.div 
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden mb-6"
                    >
                      <div className="bg-[#222] border border-emerald-500/30 rounded-2xl p-6 shadow-xl">
                        <div className="flex items-center justify-between mb-4">
                          <div className="flex items-center gap-2">
                            <Clock className="w-4 h-4 text-emerald-400" />
                            <h4 className="text-sm font-bold uppercase tracking-wider text-emerald-400">{lang === 'zh' ? '采纳记录' : 'Accepted History'}</h4>
                          </div>
                          <button onClick={() => setShowHistoryPanel(false)} className="p-1 hover:bg-white/10 rounded-full text-white/40">
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                        
                        {historyLog.length === 0 ? (
                          <div className="py-8 flex flex-col items-center justify-center text-white/20 gap-2 border border-dashed border-white/5 rounded-xl">
                            <History className="w-8 h-8" />
                            <span className="text-xs">{lang === 'zh' ? '暂无采纳记录' : 'No history yet'}</span>
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-64 overflow-y-auto pr-2 custom-scrollbar">
                            {historyLog.map((item) => (
                              <button 
                                key={item.id}
                                onClick={() => revertHistoryItem(item.id)}
                                className="group text-left p-4 rounded-xl bg-white/5 border border-white/5 hover:border-emerald-500/50 hover:bg-emerald-500/5 transition-all flex flex-col gap-2"
                              >
                                <div className="flex items-center justify-between">
                                  <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-tighter">
                                    {item.type === 'annotation' ? (lang === 'zh' ? '建议采纳' : 'Suggestion') : (lang === 'zh' ? '段落修改' : 'Para Edit')}
                                  </span>
                                  <span className="text-[10px] text-white/20">{new Date(item.timestamp).toLocaleTimeString()}</span>
                                </div>
                                <div className="text-sm text-white/80 font-medium line-clamp-1">{item.label}</div>
                                <div className="text-[11px] text-white/30 flex items-center gap-1.5 mt-1 group-hover:text-emerald-400 transition-colors">
                                  <Undo2 className="w-3 h-3" />
                                  {lang === 'zh' ? '点击恢复原段落' : 'Click to revert paragraph'}
                                </div>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {summary && summary.detected_prompt && (
                  <div className="bg-white/5 border border-white/10 rounded-2xl p-6 mb-8">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-blue-400" />
                        <h4 className="text-sm font-bold uppercase tracking-wider text-white/60">{lang === 'zh' ? '题目要求' : 'Essay Prompt'}</h4>
                      </div>
                      <button 
                        onClick={cleanUpEssay}
                        className="text-xs px-2 py-1 bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 rounded transition-colors flex items-center gap-1"
                        title={lang === 'zh' ? '从正文中移除题目要求' : 'Remove prompt from essay body'}
                      >
                        <Trash2 className="w-3 h-3" />
                        {lang === 'zh' ? '清理正文' : 'Clean Body'}
                      </button>
                    </div>
                    <p className="text-white/80 leading-relaxed whitespace-pre-wrap italic">{summary.detected_prompt}</p>
                  </div>
                )}

                {summary && (
                  <div className="bg-white/5 border border-white/10 rounded-2xl p-6 mb-8">
                    <div className="flex items-center justify-between mb-4">
                      <h4 className="text-lg font-medium">{lang === 'zh' ? '总体评价' : 'Overall Summary'}</h4>
                      <div className="px-3 py-1 bg-white/10 text-white rounded-lg text-sm font-bold border border-white/20">
                        {summary.score} {summary.grade ? '(' + summary.grade + ')' : ''}
                      </div>
                    </div>
                    <p className="text-white/80 mb-6 leading-relaxed whitespace-pre-wrap">{summary.overall_comment}</p>
                    <h5 className="text-sm font-medium text-white/50 uppercase tracking-wider mb-3">{lang === 'zh' ? '改进建议' : 'Next Steps'}</h5>
                    <ul className="space-y-2">
                      {summary.next_steps.map((step, i) => (
                        <li key={i} className="text-white/80 flex items-start gap-3">
                          <span className="text-white/40 mt-1">•</span>
                          {step}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="bg-[#1A1A1A] border border-white/10 rounded-2xl p-6 md:p-8 shadow-2xl text-lg leading-relaxed font-sans whitespace-pre-wrap break-words relative">
                  {renderAnnotatedText()}
                </div>

                {/* Global Chat Box */}
                <div className="mt-8 bg-[#1A1A1A] border border-white/10 rounded-2xl overflow-hidden shadow-2xl flex flex-col">
                  <div className="p-4 border-b border-white/10 flex items-center justify-between bg-white/5">
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-emerald-400" />
                      {lang === 'zh' ? '全局修改与问答' : 'Global Chat & Edit'}
                    </h3>
                    <select 
                      value={globalChatModel}
                      onChange={e => setGlobalChatModel(e.target.value)}
                      className="bg-black/40 border border-white/10 text-zinc-300 text-xs rounded-lg px-2 py-1 outline-none focus:ring-1 focus:ring-white"
                    >
                      <option value="gemini-3-flash-preview">Gemini 3.0 Flash</option>
                      <option value="gemini-3.1-flash-preview">Gemini 3.1 Flash</option>
                      <option value="gemini-3.1-pro-preview">Gemini 3.1 Pro</option>
                    </select>
                  </div>
                  
                  <div className="p-4 max-h-96 overflow-y-auto flex flex-col gap-4 custom-scrollbar" ref={(el) => { if (el) el.scrollTop = el.scrollHeight; }}>
                    {globalChatHistory.length === 0 && (
                      <div className="text-center text-white/40 text-sm py-4">
                        {lang === 'zh' ? '在这里输入你的问题，或者让 AI 帮你重写整篇作文...' : 'Ask questions here, or ask AI to rewrite the whole essay...'}
                      </div>
                    )}
                    {globalChatHistory.map((msg, i) => (
                      <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap ${msg.role === 'user' ? 'bg-emerald-500/20 text-emerald-100 rounded-tr-sm' : 'bg-white/10 text-white/90 rounded-tl-sm'}`}>
                          {msg.text}
                        </div>
                      </div>
                    ))}
                    {isGlobalChatLoading && (
                      <div className="flex justify-start">
                        <div className="max-w-[80%] rounded-2xl px-4 py-3 text-sm bg-white/10 text-white/90 rounded-tl-sm flex items-center gap-2">
                          <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          {lang === 'zh' ? '思考中...' : 'Thinking...'}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="p-4 bg-white/5 border-t border-white/10 flex gap-2">
                    <textarea
                      value={globalChatInput}
                      onChange={e => setGlobalChatInput(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleGlobalChat();
                        }
                      }}
                      placeholder={lang === 'zh' ? '输入你的要求 (按 Enter 发送)...' : 'Enter your request (Press Enter to send)...'}
                      className="flex-1 bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:ring-1 focus:ring-emerald-500/50 resize-none h-12 custom-scrollbar"
                    />
                    <button 
                      onClick={handleGlobalChat}
                      disabled={isGlobalChatLoading || !globalChatInput.trim()}
                      className="px-4 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center"
                    >
                      <Sparkles className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
