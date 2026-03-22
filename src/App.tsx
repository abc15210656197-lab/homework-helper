import React, { useState, useRef, useEffect, useMemo, Suspense, lazy } from 'react';
import { GoogleGenAI, Type, ThinkingLevel } from '@google/genai';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import rehypeKatex from 'rehype-katex';
import { Upload, Copy, Check, FileImage, Loader2, Trash2, AlertCircle, Camera, ArrowLeft, Info, BookOpen, ChevronRight, MessageCircle, Mic, Send, ChevronLeft, Maximize2, X, Book, FileText, Headphones, LineChart, Plus, Edit2, Palette, Globe, Keyboard, ImageIcon, RefreshCw, Clock, Folder, LogIn, LogOut, PenTool, HelpCircle, Beaker, Eye, EyeOff, Eraser, Sparkles, Settings } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { InlineMath } from 'react-katex';

import { MODELS, TRANSLATIONS } from './constants';
import { Textbook, TextbookGroup } from './components/TextbookManager';
import { db, auth } from './firebase';
import { onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut, User } from 'firebase/auth';
import * as math from 'mathjs';
import { formatContent } from './utils/formatUtils';
import { extractFunctionsFromImage, GraphScanMode } from './services/graphService';
import { getDocs, collection } from 'firebase/firestore';
import 'github-markdown-css/github-markdown-dark.css';

// Lazy load heavy components
const AudioTutorView = lazy(() => import('@/src/components/AudioTutor').then(m => ({ default: m.AudioTutorView })));
const ReadingCoach = lazy(() => import('@/src/components/ReadingCoach').then(m => ({ default: m.ReadingCoach })));
const GraphView = lazy(() => import('@/src/components/GraphView'));
const MaterialAssistant = lazy(() => import('@/src/components/MaterialAssistant').then(m => ({ default: m.MaterialAssistant })));
const EssayFeedback = lazy(() => import('@/src/components/EssayFeedback').then(m => ({ default: m.EssayFeedback })));
const ZhangJingyangMode = lazy(() => import('@/src/components/ZhangJingyangMode').then(m => ({ default: m.ZhangJingyangMode })));
const OrganicChemistryMode = lazy(() => import('@/src/components/OrganicChemistryMode').then(m => ({ default: m.OrganicChemistryMode })));
const DinoGame = lazy(() => import('@/src/components/DinoGame').then(m => ({ default: m.DinoGame })));
const MathKeyboard = lazy(() => import('@/src/components/MathKeyboard'));
const HistoryDrawer = lazy(() => import('@/src/components/HistoryDrawer').then(m => ({ default: m.HistoryDrawer })));
const UserGuideModal = lazy(() => import('@/src/components/UserGuideModal').then(m => ({ default: m.UserGuideModal })));
const TextbookManager = lazy(() => import('@/src/components/TextbookManager').then(m => ({ default: m.TextbookManager })));
const ChatBox = lazy(() => import('@/src/components/ChatBox').then(m => ({ default: m.ChatBox })));
const QuestionDetail = lazy(() => import('@/src/components/QuestionDetail').then(m => ({ default: m.QuestionDetail })));
const QuestionListItem = lazy(() => import('@/src/components/QuestionDetail').then(m => ({ default: m.QuestionListItem })));
const BackgroundLines = lazy(() => import('@/src/components/Backgrounds').then(m => ({ default: m.BackgroundLines })));
const BackgroundBubbles = lazy(() => import('@/src/components/Backgrounds').then(m => ({ default: m.BackgroundBubbles })));

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

interface QuestionData {
  summary: string;
  question: string;
  answer: string;
  explanation: string;
  precautions: string;
}

export default function App() {
  const [appMode, setAppMode] = useState<'extractor' | 'audio-tutor' | 'reading-coach' | 'grapher' | 'material-assistant' | 'essay-feedback' | 'zhang-jingyang' | 'organic-chemistry'>('extractor');
  const [materialAssistantData, setMaterialAssistantData] = useState<any>(null);
  const [essayFeedbackData, setEssayFeedbackData] = useState<any>(null);
  const [organicChemistryData, setOrganicChemistryData] = useState<any>(null);
  const [zhangJingyangData, setZhangJingyangData] = useState<any>(null);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isUserGuideOpen, setIsUserGuideOpen] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [isAppReady, setIsAppReady] = useState(false);

  useEffect(() => {
    // Simulate initial app preparation (Vite compilation/resource loading)
    const timer = setTimeout(() => setIsAppReady(true), 1500);
    return () => clearTimeout(timer);
  }, []);

  const [clearKey, setClearKey] = useState(0);
  const [theme, setTheme] = useState<'none' | 'lines' | 'bubbles'>('lines');
  const [showThemeMenu, setShowThemeMenu] = useState(false);
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);

  const adminEmail = 'abc15210656197@gmail.com';
  const isAdmin = user?.email === adminEmail;

  useEffect(() => {
    if (!auth) {
      setIsAuthLoading(false);
      return;
    }
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setIsAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleLogin = async () => {
    if (!auth) return;
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error('Login failed:', error);
    }
  };

  const handleLogout = async () => {
    if (!auth) return;
    try {
      await signOut(auth);
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  const handleClearCurrentFeature = () => {
    setClearKey(prev => prev + 1);
    switch (appMode) {
      case 'extractor':
      case 'audio-tutor':
        setFiles([]);
        setPreviewUrls([]);
        setQuestions([]);
        setSelectedIdx(null);
        setError(null);
        break;
      case 'grapher':
        setGraphFunctions([]);
        setGraphParameters({});
        setGraphInputValue('');
        setGraphEditingId(null);
        setGraphActiveTab('manual');
        setGraphScannedResults([]);
        setGraphLastImageData(null);
        setGraphSelectedIndices(new Set());
        break;
      case 'material-assistant':
        setMaterialAssistantData(null);
        break;
      case 'essay-feedback':
        setEssayFeedbackData(null);
        break;
      case 'organic-chemistry':
        setOrganicChemistryData(null);
        break;
      case 'zhang-jingyang':
        setZhangJingyangData(null);
        break;
      case 'reading-coach':
        // Handled by clearKey
        break;
    }
  };

  const saveHistory = async (module: string, summary: string, content: any, file?: File | { base64: string, mimeType: string }) => {
    if (!user) return;
    
    let imageUrl = null;
    let imageFileId = null;

    if (file) {
      try {
        const formData = new FormData();
        if (file instanceof File) {
          formData.append('file', file);
        } else {
          // Convert base64 to blob without using fetch to avoid URL length limits
          const byteCharacters = atob(file.base64);
          const byteNumbers = new Array(byteCharacters.length);
          for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
          }
          const byteArray = new Uint8Array(byteNumbers);
          const blob = new Blob([byteArray], { type: file.mimeType });
          
          // Determine extension from mimeType
          let ext = 'jpg';
          if (file.mimeType.includes('png')) ext = 'png';
          else if (file.mimeType.includes('mp4')) ext = 'mp4';
          else if (file.mimeType.includes('webm')) ext = 'webm';
          
          formData.append('file', blob, `file.${ext}`);
        }

        const uploadRes = await fetch('/api/upload', {
          method: 'POST',
          body: formData,
        });

        if (uploadRes.ok) {
          const uploadData = await uploadRes.json();
          imageUrl = uploadData.url;
          imageFileId = uploadData.fileId;
        }
      } catch (e) {
        console.error('Failed to upload image for history', e);
      }
    }

    try {
      await fetch('/api/records', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          module,
          summary,
          content,
          imageUrl,
          imageFileId,
          uid: user.uid
        })
      });
    } catch (e) {
      console.error('Failed to save history', e);
    }
  };

  const handleSelectHistoryRecord = async (record: any) => {
    setIsHistoryOpen(false);
    try {
      let content = JSON.parse(record.content);
      if (typeof content === 'string') {
        content = JSON.parse(content);
      }
      
      if (content && content.isCloudFile && content.url) {
        try {
          const res = await fetch(`/api/proxy?url=${encodeURIComponent(content.url)}`);
          if (res.ok) {
            content = await res.json();
          } else {
            console.error('Failed to fetch cloud content');
            return;
          }
        } catch (e) {
          console.error('Error fetching cloud content', e);
          return;
        }
      }

      if (record.module === 'extractor') {
        setAppMode('extractor');
        const loadedQuestions = content.questions || (Array.isArray(content) ? content : []);
        setQuestions(loadedQuestions);
        if (loadedQuestions.length > 0) {
          setSelectedIdx(0);
        }

        // Restore image if available
        if (record.image_url) {
          setPreviewUrls([record.image_url]);
          try {
            const response = await fetch(`/api/proxy?url=${encodeURIComponent(record.image_url)}`);
            const blob = await response.blob();
            const file = new File([blob], "restored_image.jpg", { type: blob.type });
            setFiles([file]);
          } catch (err) {
            console.error('Failed to restore image file', err);
          }
        } else {
          setFiles([]);
          setPreviewUrls([]);
        }
      } else if (record.module === 'audio-tutor') {
        setAppMode('audio-tutor');
        // Audio tutor restoration logic would go here if needed
      } else if (record.module === 'reading-coach') {
        setAppMode('reading-coach');
        // Reading coach restoration logic
      } else if (record.module === 'grapher') {
        setAppMode('grapher');
        if (content.functions) setGraphFunctions(content.functions);
        if (content.parameters) setGraphParameters(content.parameters);
      } else if (record.module === 'material-assistant') {
        setAppMode('material-assistant');
        setMaterialAssistantData({
          ...content,
          image_url: record.image_url
        });
      } else if (record.module === 'essay-feedback') {
        setAppMode('essay-feedback');
        setEssayFeedbackData(content);
      } else if (record.module === 'organic-chemistry') {
        setAppMode('organic-chemistry');
        setOrganicChemistryData(content);
      } else if (record.module === 'zhang-jingyang') {
        setAppMode('zhang-jingyang');
        setZhangJingyangData(content);
      }
    } catch (e) {
      console.error('Failed to parse history content', e);
    }
  };

  const handleSaveGraph = async () => {
    if (graphFunctions.length === 0) return;
    const summary = graphFunctions.map(f => f.expression).join(', ').substring(0, 50) + (graphFunctions.length > 1 ? '...' : '');
    const content = {
      functions: graphFunctions,
      parameters: graphParameters
    };
    
    await saveHistory('grapher', summary, content, undefined);
  };

  const [files, setFiles] = useState<File[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [questions, setQuestions] = useState<QuestionData[]>([]);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [selectedModel, setSelectedModel] = useState('gemini-3-flash-preview');
  const [language, setLanguage] = useState<'zh' | 'en'>('zh');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  
  const [showTextbookManager, setShowTextbookManager] = useState(false);
  const [showMaterialManager, setShowMaterialManager] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [textbooks, setTextbooks] = useState<Textbook[]>([]);
  const [textbookGroups, setTextbookGroups] = useState<TextbookGroup[]>([]);
  const [materials, setMaterials] = useState<Textbook[]>([]);
  const [materialGroups, setMaterialGroups] = useState<TextbookGroup[]>([]);
  const [selectedTextbookIds, setSelectedTextbookIds] = useState<string[]>([]);
  const [associateTextbook, setAssociateTextbook] = useState(false);

  // Grapher State
  const [graphFunctions, setGraphFunctions] = useState<{id: string, expression: string, visible: boolean, color: string}[]>([]);
  const [graphParameters, setGraphParameters] = useState<Record<string, any>>({});
  const [graphInputValue, setGraphInputValue] = useState('');
  const [graphEditingId, setGraphEditingId] = useState<string | null>(null);
  const [graphActiveTab, setGraphActiveTab] = useState<'manual' | 'photo'>('manual');
  const [graphScanMode, setGraphScanMode] = useState<GraphScanMode>('gemini-3.1-flash-lite-low');
  const [graphIsScanning, setGraphIsScanning] = useState(false);
  const [graphScannedResults, setGraphScannedResults] = useState<string[]>([]);
  const [graphLastImageData, setGraphLastImageData] = useState<{ base64: string, mimeType: string } | null>(null);
  const [graphSelectedIndices, setGraphSelectedIndices] = useState<Set<number>>(new Set());
  const [graphShowColorPicker, setGraphShowColorPicker] = useState<string | null>(null);
  const graphInputRef = useRef<HTMLInputElement>(null);
  const graphFileInputRef = useRef<HTMLInputElement>(null);

  const COLORS = [
    '#6366f1', '#ec4899', '#f59e0b', '#10b981', '#ef4444', 
    '#3b82f6', '#8b5cf6', '#06b6d4', '#f97316', '#14b8a6',
    '#ffffff'
  ];

  const splitImplicitMultiplication = (expr: string) => {
    const functions = ['sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'log', 'ln', 'sqrt', 'abs', 'exp', 'pi', 'phi'];
    let processed = expr;
    const placeholders: string[] = [];
    
    // Sort functions by length descending to avoid partial matches
    const sortedFns = [...functions].sort((a, b) => b.length - a.length);
    
    sortedFns.forEach((fn, i) => {
      const placeholder = ` \uE000${i}\uE000 `;
      processed = processed.replace(new RegExp(fn, 'gi'), placeholder);
      placeholders[i] = fn;
    });
    
    // Split adjacent letters: kx -> k x
    processed = processed.replace(/([a-z])([a-z])/gi, '$1 $2');
    processed = processed.replace(/([a-z])([a-z])/gi, '$1 $2'); // Double pass for cases like kxy
    
    // Restore functions
    sortedFns.forEach((fn, i) => {
      processed = processed.replace(new RegExp(` \\uE000${i}\\uE000 `, 'g'), fn);
    });
    
    return processed;
  };

  const normalizeMathExpression = (expression: string) => {
    return expression
      .replace(/[a-zA-Z]\(x\)\s*=/g, '')
      .replace(/y\s*=/g, '')
      .replace(/sin\^-1/gi, 'asin')
      .replace(/cos\^-1/gi, 'acos')
      .replace(/tan\^-1/gi, 'atan')
      .replace(/\\sin/g, 'sin')
      .replace(/\\cos/g, 'cos')
      .replace(/\\tan/g, 'tan')
      .replace(/\\arcsin/g, 'asin')
      .replace(/\\arccos/g, 'acos')
      .replace(/\\arctan/g, 'atan')
      .replace(/\\ln/g, 'log')
      .replace(/\bln\b/g, 'log')
      .replace(/\\log_2/g, 'log2')
      .replace(/\\log_\{2\}/g, 'log2')
      .replace(/\\log_{10}/g, 'log10')
      .replace(/\\sqrt{/g, 'sqrt(')
      .replace(/\\frac{([^{}]+)}{([^{}]+)}/g, '(($1)/($2))')
      .replace(/\\frac{([^{}]+)}{([^{}]+)}/g, '(($1)/($2))')
      .replace(/\\cdot/g, '*')
      .replace(/\\times/g, '*')
      .replace(/\\div/g, '/')
      .replace(/\\left\(/g, '(')
      .replace(/\\right\)/g, ')')
      .replace(/{/g, '(')
      .replace(/}/g, ')')
      .replace(/\\/g, '')
      .replace(/log2\(([^)]+)\)/gi, 'log($1, 2)')
      .replace(/log10\(([^)]+)\)/gi, 'log($1, 10)')
      .replace(/π/gi, 'PI')
      .trim();
  };

  const t = TRANSLATIONS[language];

  // Grapher Helpers
  const addGraphFunction = (expr: string) => {
    if (!expr.trim()) return;
    const processedExpr = splitImplicitMultiplication(expr);
    detectGraphParameters(processedExpr);
    if (graphEditingId) {
      setGraphFunctions(prev => prev.map(f => f.id === graphEditingId ? { ...f, expression: expr } : f));
      setGraphEditingId(null);
    } else {
      setGraphFunctions(prev => {
        const newFunc = {
          id: Math.random().toString(36).substr(2, 9),
          expression: expr,
          visible: true,
          color: COLORS[prev.length % COLORS.length]
        };
        return [...prev, newFunc];
      });
    }
    setGraphInputValue('');
  };

  const detectGraphParameters = (expr: string) => {
    try {
      const normalized = normalizeMathExpression(expr);
      const processed = splitImplicitMultiplication(normalized);
      const node = math.parse(processed);
      const variables = new Set<string>();
      node.traverse((n: any) => {
        if (n.type === 'SymbolNode' && !['x', 'y', 'e', 'pi', 'PI', 'phi', 'i'].includes(n.name)) {
          try {
            if (typeof (math as any)[n.name] !== 'function') {
              variables.add(n.name);
            }
          } catch {
            variables.add(n.name);
          }
        }
      });
      
      setGraphParameters(prev => {
        const newParams = { ...prev };
        let changed = false;
        variables.forEach(v => {
          if (!newParams[v]) {
            newParams[v] = { name: v, value: 1, min: -10, max: 10, step: 0.1 };
            changed = true;
          }
        });
        return changed ? newParams : prev;
      });
    } catch (e) {}
  };

  const insertAtGraphCursor = (text: string) => {
    const input = graphInputRef.current;
    if (!input) return;
    const start = input.selectionStart || 0;
    const end = input.selectionEnd || 0;
    let newValue = '';
    let newCursorPos = start + text.length;
    if (text === 'frac') {
      const template = '()/()';
      newValue = graphInputValue.substring(0, start) + template + graphInputValue.substring(end);
      newCursorPos = start + 1;
    } else if (['sqrt(', 'abs(', 'log(', 'sin(', 'cos(', 'tan('].includes(text)) {
      const template = text + ')';
      newValue = graphInputValue.substring(0, start) + template + graphInputValue.substring(end);
      newCursorPos = start + text.length;
    } else {
      newValue = graphInputValue.substring(0, start) + text + graphInputValue.substring(end);
      newCursorPos = start + text.length;
    }
    setGraphInputValue(newValue);
    setTimeout(() => {
      input.selectionStart = input.selectionEnd = newCursorPos;
      input.focus();
    }, 0);
  };

  const deleteAtGraphCursor = () => {
    const input = graphInputRef.current;
    if (!input) return;
    const start = input.selectionStart || 0;
    const end = input.selectionEnd || 0;
    if (start === end && start > 0) {
      const newValue = graphInputValue.substring(0, start - 1) + graphInputValue.substring(end);
      setGraphInputValue(newValue);
      setTimeout(() => { input.selectionStart = input.selectionEnd = start - 1; input.focus(); }, 0);
    } else if (start !== end) {
      const newValue = graphInputValue.substring(0, start) + graphInputValue.substring(end);
      setGraphInputValue(newValue);
      setTimeout(() => { input.selectionStart = input.selectionEnd = start; input.focus(); }, 0);
    }
  };

  const moveGraphCursor = (dir: 'left' | 'right') => {
    const input = graphInputRef.current;
    if (!input) return;
    const start = input.selectionStart || 0;
    if (dir === 'left' && start > 0) input.selectionStart = input.selectionEnd = start - 1;
    else if (dir === 'right' && start < graphInputValue.length) input.selectionStart = input.selectionEnd = start + 1;
    input.focus();
  };

  const toGraphLatex = (expr: string) => {
    try {
      let cleanExpr = expr.trim();
      if (!cleanExpr) return '';
      const parts = cleanExpr.split('=');
      let left = 'y';
      let right = cleanExpr;
      if (parts.length > 1) { left = parts[0].trim(); right = parts[1].trim(); }
      let processedRight = right.replace(/log2\(([^)]+)\)/g, 'log($1, 2)').replace(/log10\(([^)]+)\)/g, 'log($1, 10)');
      const node = math.parse(processedRight);
      let tex = node.toTex({ parenthesis: 'keep', implicit: 'hide' });
      return parts.length > 1 ? `${left} = ${tex}` : tex;
    } catch (e) {
      return expr.replace(/\//g, '\\div ').replace(/\*/g, '\\cdot ').replace(/sqrt\(([^)]+)\)/g, '\\sqrt{$1}').replace(/\(([^)]+)\)\/\(([^)]+)\)/g, '\\frac{$1}{$2}');
    }
  };

  const handleGraphFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setGraphIsScanning(true);
    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64 = (reader.result as string).split(',')[1];
      setGraphLastImageData({ base64, mimeType: file.type });
      const results = await extractFunctionsFromImage(base64, file.type, graphScanMode);
      setGraphScannedResults(results);
      setGraphSelectedIndices(new Set(results.map((_, i) => i)));
      setGraphIsScanning(false);
      saveHistory('grapher', results.join(', '), { functions: results.map(r => ({ id: Math.random().toString(36).substr(2, 9), expression: r, visible: true, color: COLORS[0] })) }, { base64, mimeType: file.type });
    };
    reader.readAsDataURL(file);
  };

  const regenerateGraphFunctions = async () => {
    if (!graphLastImageData) return;
    setGraphIsScanning(true);
    const results = await extractFunctionsFromImage(
      graphLastImageData.base64, 
      graphLastImageData.mimeType, 
      graphScanMode
    );
    setGraphScannedResults(results);
    setGraphSelectedIndices(new Set(results.map((_, i) => i)));
    setGraphIsScanning(false);
    saveHistory('grapher', results.join(', '), { functions: results.map(r => ({ id: Math.random().toString(36).substr(2, 9), expression: r, visible: true, color: COLORS[0] })) }, graphLastImageData);
  };

  useEffect(() => {
    loadTextbooks();
  }, [showTextbookManager]);

  useEffect(() => {
    loadMaterials();
  }, [showMaterialManager]);

  const loadMaterials = async () => {
    await loadGroups('material');
    try {
      if (!db) throw new Error('Firebase not configured');
      const querySnapshot = await getDocs(collection(db, 'materials'));
      const books: Textbook[] = [];
      querySnapshot.forEach((doc) => {
        books.push({ id: doc.id, ...doc.data() } as Textbook);
      });
      
      // Merge with local storage if Firestore is empty
      if (books.length === 0) {
        const localBooks = localStorage.getItem('materials');
        if (localBooks) {
          try {
            const parsed = JSON.parse(localBooks);
            books.push(...parsed);
          } catch (e) {
            // ignore
          }
        }
      }

      const sortedBooks = books.sort((a, b) => {
        const aTime = a.createdAt?.toMillis ? a.createdAt.toMillis() : (a.createdAt?.seconds ? a.createdAt.seconds * 1000 : (a.createdAt || 0));
        const bTime = b.createdAt?.toMillis ? b.createdAt.toMillis() : (b.createdAt?.seconds ? b.createdAt.seconds * 1000 : (b.createdAt || 0));
        return bTime - aTime;
      });
      setMaterials(sortedBooks);
    } catch (err) {
      console.warn("Firebase error in App.tsx, falling back to localStorage:", err);
      const localBooks = localStorage.getItem('materials');
      if (localBooks) {
        try {
          const parsed = JSON.parse(localBooks);
          const sortedBooks = parsed.sort((a: any, b: any) => (b.createdAt?.seconds || b.createdAt || 0) - (a.createdAt?.seconds || a.createdAt || 0));
          setMaterials(sortedBooks);
        } catch (e) {
          setMaterials([]);
        }
      } else {
        setMaterials([]);
      }
    }
  };

  const loadGroups = async (type: 'textbook' | 'material') => {
    const groupsCollectionName = type === 'material' ? 'material_groups' : 'textbook_groups';
    const groupsStorageKey = type === 'material' ? 'material_groups' : 'textbook_groups';
    try {
      if (!db) throw new Error('Firebase not configured');
      const querySnapshot = await getDocs(collection(db, groupsCollectionName));
      const loadedGroups: TextbookGroup[] = [];
      querySnapshot.forEach((doc) => {
        loadedGroups.push({ id: doc.id, ...doc.data() } as TextbookGroup);
      });
      const sortedGroups = loadedGroups.sort((a, b) => {
        const aTime = a.createdAt?.toMillis ? a.createdAt.toMillis() : (a.createdAt?.seconds ? a.createdAt.seconds * 1000 : (a.createdAt || 0));
        const bTime = b.createdAt?.toMillis ? b.createdAt.toMillis() : (b.createdAt?.seconds ? b.createdAt.seconds * 1000 : (b.createdAt || 0));
        return bTime - aTime;
      });
      if (type === 'material') setMaterialGroups(sortedGroups);
      else setTextbookGroups(sortedGroups);
    } catch (err) {
      const localGroups = localStorage.getItem(groupsStorageKey);
      if (localGroups) {
        try {
          const parsed = JSON.parse(localGroups);
          if (type === 'material') setMaterialGroups(parsed);
          else setTextbookGroups(parsed);
        } catch (e) {
          // ignore
        }
      }
    }
  };

  const loadTextbooks = async () => {
    await loadGroups('textbook');
    try {
      if (!db) throw new Error('Firebase not configured');
      const querySnapshot = await getDocs(collection(db, 'textbooks'));
      const books: Textbook[] = [];
      querySnapshot.forEach((doc) => {
        books.push({ id: doc.id, ...doc.data() } as Textbook);
      });

      // Merge with local storage if Firestore is empty
      if (books.length === 0) {
        const localBooks = localStorage.getItem('textbooks');
        if (localBooks) {
          try {
            const parsed = JSON.parse(localBooks);
            books.push(...parsed);
          } catch (e) {
            // ignore
          }
        }
      }

      const sortedBooks = books.sort((a, b) => {
        const aTime = a.createdAt?.toMillis ? a.createdAt.toMillis() : (a.createdAt?.seconds ? a.createdAt.seconds * 1000 : (a.createdAt || 0));
        const bTime = b.createdAt?.toMillis ? b.createdAt.toMillis() : (b.createdAt?.seconds ? b.createdAt.seconds * 1000 : (b.createdAt || 0));
        return bTime - aTime;
      });
      setTextbooks(sortedBooks);
      
      // Select all by default if nothing is selected
      if (selectedTextbookIds.length === 0 && sortedBooks.length > 0) {
        setSelectedTextbookIds(sortedBooks.map(b => b.id));
      }
    } catch (err) {
      console.warn("Firebase error in App.tsx, falling back to localStorage:", err);
      const localBooks = localStorage.getItem('textbooks');
      if (localBooks) {
        try {
          const parsed = JSON.parse(localBooks);
          const sortedBooks = parsed.sort((a: any, b: any) => (b.createdAt?.seconds || b.createdAt || 0) - (a.createdAt?.seconds || a.createdAt || 0));
          setTextbooks(sortedBooks);
          if (selectedTextbookIds.length === 0 && sortedBooks.length > 0) {
            setSelectedTextbookIds(sortedBooks.map((b: any) => b.id));
          }
        } catch (e) {
          setTextbooks([]);
        }
      } else {
        setTextbooks([]);
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      processFiles(e.target.files);
      e.target.value = ''; // Clear the input value
    }
  };

  const processFiles = (selectedFiles: FileList | File[]) => {
    const newFiles = Array.from(selectedFiles).filter(f => f.type.startsWith('image/'));
    if (newFiles.length === 0) return;
    setFiles(prev => [...prev, ...newFiles]);
    const newUrls = newFiles.map(f => URL.createObjectURL(f));
    setPreviewUrls(prev => [...prev, ...newUrls]);
    setQuestions([]);
    setSelectedIdx(null);
    setError(null);
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
    setPreviewUrls(prev => {
      const newUrls = [...prev];
      URL.revokeObjectURL(newUrls[index]);
      newUrls.splice(index, 1);
      return newUrls;
    });
  };

  const clearFiles = () => {
    setFiles([]);
    setGraphLastImageData(null);
    previewUrls.forEach(url => URL.revokeObjectURL(url));
    setPreviewUrls([]);
    setQuestions([]);
    setSelectedIdx(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (cameraInputRef.current) cameraInputRef.current.value = '';
  };

  const extractQuestions = async () => {
    if (files.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      const imageParts = await Promise.all(files.map(async (f) => {
        const base64Data = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve((reader.result as string).split(',')[1]);
          reader.onerror = reject;
          reader.readAsDataURL(f);
        });
        return { inlineData: { data: base64Data, mimeType: f.type } };
      }));

      const parts: any[] = [...imageParts];

      if (associateTextbook && selectedTextbookIds.length > 0 && textbooks.length > 0) {
        for (const id of selectedTextbookIds) {
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
              parts.push({ inlineData: { data: base64, mimeType: 'application/pdf' } });
            } catch (err) {
              console.error("Failed to fetch textbook PDF", err);
            }
          }
        }
      }

      parts.push({
        text: `Analyze the provided image and extract all questions. For each question, provide:
1. summary: A short summary.
2. question: The full question text (题干). Use standard Markdown table syntax for tables.
3. answer: The answer to the question (e.g., "A", "B", "C", "D" or the specific value).
4. explanation: A detailed explanation and solution (讲解).
5. precautions: Important notes, common pitfalls, or tips (注意事项).

CRITICAL INSTRUCTIONS:
- OUTPUT LANGUAGE: ${language === 'zh' ? 'Chinese' : 'English'}.
- Use STRICT LaTeX for ALL math symbols, chemical formulas (e.g., $Cl_2$, $H_2O$, $Na^+$, $SO_4^{2-}$), units (e.g., $mol/L$, $g/cm^3$), and formatting.
- **Wrap EVERY single math/formula/unit/equation in $ for inline or $$ for block math. This is MANDATORY for chemical equations like $2NO_2 \\rightleftharpoons N_2O_4$.**
- Example: Use $Cl_2$ instead of Cl2, use $1 \\text{ mol}$ instead of 1mol, use $2H_2 + O_2 \\rightarrow 2H_2O$ for equations.
- Use standard numbering: (1), (2)... or ①, ②... for sub-questions. Use a., b.... for sub-sub-questions.
- Preserve the original layout in the "question" field. **For multiple-choice questions, ensure each option (A, B, C, D) starts on a NEW line. This is CRITICAL.**
- Return the result as a JSON object containing an 'overall_summary' and an array of 'questions'.
- Ensure all backslashes in LaTeX are properly escaped in the JSON string (e.g., "\\\\\\\\text" for \\text).`,
      });

      const response = await ai.models.generateContent({
        model: selectedModel,
        contents: {
          parts: parts,
        },
        config: {
          responseMimeType: 'application/json',
          thinkingConfig: {
            thinkingLevel: selectedModel.includes('flash') ? ThinkingLevel.LOW : ThinkingLevel.HIGH
          },
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              overall_summary: { 
                type: Type.STRING,
                description: "A brief 10-15 word summary of the overall topic or subject of all questions in the image"
              },
              questions: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    summary: { type: Type.STRING },
                    question: { type: Type.STRING },
                    answer: { type: Type.STRING },
                    explanation: { type: Type.STRING },
                    precautions: { type: Type.STRING },
                  },
                  required: ['summary', 'question', 'answer', 'explanation', 'precautions'],
                },
              }
            },
            required: ['overall_summary', 'questions']
          },
        },
      });

      const text = response.text;
      if (text) {
        const parsed = JSON.parse(text);
        
        let extractedQuestions = [];
        let summaryText = '';
        
        if (Array.isArray(parsed)) {
          extractedQuestions = parsed;
          summaryText = parsed[0]?.summary || (language === 'zh' ? '提取的题目' : 'Extracted Questions');
        } else if (parsed && parsed.questions && Array.isArray(parsed.questions)) {
          extractedQuestions = parsed.questions;
          summaryText = parsed.overall_summary || extractedQuestions[0]?.summary || (language === 'zh' ? '提取的题目' : 'Extracted Questions');
        }

        if (extractedQuestions.length > 0) {
          setQuestions(extractedQuestions);
          saveHistory('extractor', summaryText, { questions: extractedQuestions }, files[0]);
        } else {
          setError(language === 'zh' ? '未识别到题目或返回格式错误。' : 'No questions identified or invalid format returned.');
        }
      }
    } catch (err: any) {
      const errorMsg = language === 'zh' ? (err.message || '提取题目时发生错误。') : (err.message || 'Error extracting questions.');
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  if (!isAppReady || isAuthLoading) {
    return (
      <div className="fixed inset-0 bg-zinc-950 flex flex-col items-center justify-center z-[9999] overflow-hidden">
        {/* Animated Background Elements */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <motion.div
            animate={{
              scale: [1, 1.2, 1],
              opacity: [0.1, 0.2, 0.1],
              rotate: [0, 90, 0],
            }}
            transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
            className="absolute -top-1/2 -left-1/2 w-full h-full bg-gradient-radial from-white/10 to-transparent blur-3xl"
          />
          <motion.div
            animate={{
              scale: [1.2, 1, 1.2],
              opacity: [0.1, 0.15, 0.1],
              rotate: [0, -90, 0],
            }}
            transition={{ duration: 12, repeat: Infinity, ease: "linear" }}
            className="absolute -bottom-1/2 -right-1/2 w-full h-full bg-gradient-radial from-white/10 to-transparent blur-3xl"
          />
        </div>

        <motion.div 
          initial={{ scale: 0.9, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          className="flex flex-col items-center relative z-10"
        >
          <div className="relative mb-8">
            <motion.div
              animate={{
                scale: [1, 1.1, 1],
                opacity: [0.3, 0.6, 0.3],
              }}
              transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
              className="absolute inset-0 bg-white/20 blur-2xl rounded-full"
            />
            <div className="w-24 h-24 rounded-[2rem] bg-white/5 border border-white/10 flex items-center justify-center shadow-[0_0_50px_rgba(255,255,255,0.1)] relative overflow-hidden backdrop-blur-sm">
              <motion.div 
                animate={{ rotate: 360 }}
                transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
                className="absolute inset-0 bg-gradient-to-tr from-white/10 via-transparent to-white/10"
              />
              <Sparkles className="w-12 h-12 text-white relative z-10 drop-shadow-[0_0_10px_rgba(255,255,255,0.5)]" />
            </div>
          </div>

          <motion.h1 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.5 }}
            className="text-4xl font-black text-white tracking-tighter mb-4 bg-clip-text text-transparent bg-gradient-to-b from-white to-white/40"
          >
            作业帮手 Pro
          </motion.h1>

          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6, duration: 0.5 }}
            className="flex flex-col items-center gap-4"
          >
            <div className="flex items-center gap-3 text-zinc-400 text-sm font-medium tracking-widest uppercase">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
              >
                <Loader2 className="w-4 h-4" />
              </motion.div>
              <span>Initializing Intelligence</span>
            </div>
            
            <div className="w-48 h-1 bg-white/5 rounded-full overflow-hidden relative">
              <motion.div
                initial={{ x: "-100%" }}
                animate={{ x: "100%" }}
                transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent"
              />
            </div>
          </motion.div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.4 }}
          transition={{ delay: 1, duration: 1 }}
          className="absolute bottom-12 text-[10px] text-zinc-500 font-mono tracking-[0.2em] uppercase"
        >
          Powered by Gemini 3.1 Pro
        </motion.div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen bg-black text-zinc-100 font-sans selection:bg-zinc-800 selection:text-white relative flex flex-col`}>
      <Suspense fallback={
        <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-[9999]">
          <Loader2 className="w-8 h-8 text-white animate-spin" />
        </div>
      }>
        {theme === 'lines' && <BackgroundLines />}
        {theme === 'bubbles' && <BackgroundBubbles />}
        <div className={`max-w-4xl mx-auto px-4 py-4 md:py-8 relative z-10 flex-1 flex flex-col w-full`}>
        <div className="flex justify-between items-start mb-4">
          <div className="flex items-center gap-3">
            <button
              onClick={handleClearCurrentFeature}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 rounded-full text-xs text-red-400 transition-colors h-8"
              title={language === 'zh' ? '清空当前功能进度' : 'Clear current feature progress'}
            >
              <Trash2 className="w-4 h-4" />
              {language === 'zh' ? '清空' : 'Clear'}
            </button>
          </div>
          
          <div className="flex flex-col items-end gap-2 relative">
            <div className="flex items-center gap-3">
              <button 
                onClick={() => setShowSettingsMenu(!showSettingsMenu)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs transition-all duration-300 h-8 shadow-lg ${
                  showSettingsMenu 
                    ? 'bg-white/20 text-white border-white/30 ring-2 ring-white/10' 
                    : 'bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-300 hover:text-white'
                }`}
              >
                <Settings className={`w-4 h-4 transition-transform duration-500 ${showSettingsMenu ? 'rotate-90' : ''}`} />
                {language === 'zh' ? '设置' : 'Settings'}
              </button>
              {user ? (
                <div className="relative">
                  <button 
                    onClick={() => setShowUserMenu(!showUserMenu)}
                    className="flex items-center gap-2 focus:outline-none"
                  >
                    {user.photoURL ? (
                      <img 
                        src={user.photoURL} 
                        alt={user.displayName || 'User'} 
                        className="w-8 h-8 rounded-full border border-white/20 hover:border-white/40 transition-colors object-cover"
                        referrerPolicy="no-referrer"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                          (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
                        }}
                      />
                    ) : null}
                    <div className={`w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-white font-bold text-sm border border-white/20 ${user.photoURL ? 'hidden' : ''}`}>
                      {user.displayName ? user.displayName.charAt(0).toUpperCase() : (user.email ? user.email.charAt(0).toUpperCase() : 'U')}
                    </div>
                  </button>
                  
                  <AnimatePresence>
                    {showUserMenu && (
                      <>
                        <div 
                          className="fixed inset-0 z-40" 
                          onClick={() => setShowUserMenu(false)}
                        />
                        <motion.div
                          initial={{ opacity: 0, y: 5, scale: 0.95 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: 5, scale: 0.95 }}
                          transition={{ duration: 0.15 }}
                          className="absolute right-0 top-full mt-2 w-28 bg-zinc-900/90 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl overflow-hidden z-50"
                        >
                          <button
                            onClick={() => {
                              setShowUserMenu(false);
                              handleLogout();
                            }}
                            className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-red-400 hover:bg-red-500/10 transition-colors"
                          >
                            <LogOut className="w-4 h-4" />
                            {language === 'zh' ? '注销' : 'Logout'}
                          </button>
                        </motion.div>
                      </>
                    )}
                  </AnimatePresence>
                </div>
              ) : (
                <button
                  onClick={handleLogin}
                  className="flex items-center gap-1.5 px-2.5 py-1 bg-white/5 hover:bg-white/10 border border-white/10 rounded-full text-xs text-zinc-300 transition-colors h-8"
                >
                  <LogIn className="w-3.5 h-3.5" />
                  {language === 'zh' ? '登录' : 'Login'}
                </button>
              )}
            </div>
            
            <AnimatePresence>
              {showSettingsMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowSettingsMenu(false)} />
                  <motion.div 
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    transition={{ duration: 0.2, ease: "easeOut" }}
                    className="absolute right-0 top-full mt-2 border border-white/10 rounded-2xl p-3 bg-zinc-900/95 backdrop-blur-2xl flex flex-col gap-2.5 z-50 w-48 shadow-2xl"
                  >
                    <div className="text-[10px] uppercase tracking-widest text-zinc-500 px-1 font-bold">{language === 'zh' ? '语言' : 'Language'}</div>
                    <div 
                      className="flex items-center bg-white/5 border border-white/10 rounded-xl p-1 cursor-pointer relative w-full h-8 select-none group hover:border-white/20 transition-colors"
                      onClick={() => setLanguage(prev => prev === 'zh' ? 'en' : 'zh')}
                    >
                      <motion.div
                        className="absolute inset-y-1 left-1 bg-white/10 border border-white/20 rounded-lg shadow-inner"
                        initial={false}
                        animate={{ 
                          x: language === 'zh' ? '0%' : '100%',
                          width: 'calc(50% - 4px)'
                        }}
                        transition={{ type: "spring", stiffness: 400, damping: 30 }}
                      />
                      <div className={`flex-1 text-center text-xs font-bold z-10 transition-colors duration-300 ${language === 'zh' ? 'text-white' : 'text-zinc-500'}`}>
                        中
                      </div>
                      <div className={`flex-1 text-center text-xs font-bold z-10 transition-colors duration-300 ${language === 'en' ? 'text-white' : 'text-zinc-500'}`}>
                        EN
                      </div>
                    </div>
                    
                    <div className="text-[10px] uppercase tracking-widest text-zinc-500 px-1 mt-1 font-bold">{language === 'zh' ? '主题' : 'Theme'}</div>
                    <div className="grid grid-cols-1 gap-1">
                      <button onClick={() => { setTheme('none'); setShowSettingsMenu(false); }} className={`w-full text-left px-3 py-2 text-xs rounded-xl transition-all ${theme === 'none' ? 'bg-white/10 text-white font-bold' : 'text-zinc-400 hover:bg-white/5 hover:text-zinc-200'}`}>
                        {language === 'zh' ? '无 (纯黑)' : 'None (Black)'}
                      </button>
                      <button onClick={() => { setTheme('lines'); setShowSettingsMenu(false); }} className={`w-full text-left px-3 py-2 text-xs rounded-xl transition-all ${theme === 'lines' ? 'bg-white/10 text-white font-bold' : 'text-zinc-400 hover:bg-white/5 hover:text-zinc-200'}`}>
                        {language === 'zh' ? '流动线条' : 'Flowing Lines'}
                      </button>
                      <button onClick={() => { setTheme('bubbles'); setShowSettingsMenu(false); }} className={`w-full text-left px-3 py-2 text-xs rounded-xl transition-all ${theme === 'bubbles' ? 'bg-white/10 text-white font-bold' : 'text-zinc-400 hover:bg-white/5 hover:text-zinc-200'}`}>
                        {language === 'zh' ? '空灵气泡' : 'Ethereal Bubbles'}
                      </button>
                    </div>

                    <div className="h-px bg-white/10 my-1" />
                    <div className="grid grid-cols-1 gap-1">
                      <button
                        onClick={() => { setIsUserGuideOpen(true); setShowSettingsMenu(false); }}
                        className="flex items-center gap-2 px-3 py-2 hover:bg-white/5 rounded-xl text-xs text-zinc-400 hover:text-zinc-200 transition-all"
                      >
                        <HelpCircle className="w-4 h-4" />
                        {language === 'zh' ? '使用指引' : 'Guide'}
                      </button>
                      <button
                        onClick={() => { setIsHistoryOpen(true); setShowSettingsMenu(false); }}
                        className="flex items-center gap-2 px-3 py-2 hover:bg-white/5 rounded-xl text-xs text-zinc-400 hover:text-zinc-200 transition-all"
                      >
                        <Clock className="w-4 h-4" />
                        {language === 'zh' ? '历史记录' : 'History'}
                      </button>
                    </div>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>
        </div>

        <header className="mb-4 text-center p-3 md:p-4 rounded-2xl border border-white/10 backdrop-blur-2xl shadow-2xl relative shrink-0 liquid-panel">
          <motion.h1 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-2xl md:text-4xl font-bold tracking-tight text-white mb-1"
          >
            {t.title} <span className="text-white">Pro</span>
          </motion.h1>
          <motion.p 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="text-zinc-400 max-w-xl mx-auto text-[10px] md:text-sm leading-relaxed"
          >
            {t.subtitle}
          </motion.p>
        </header>

        <main className={`space-y-6 flex-1 flex flex-col`}>
          <div className="flex justify-center mb-4 md:mb-8 shrink-0">
            <div className="grid grid-cols-4 sm:flex sm:flex-wrap justify-center gap-3 md:gap-8 p-3 md:p-4 rounded-3xl border border-white/5 backdrop-blur-3xl shadow-[0_8px_32px_rgba(0,0,0,0.4)] bg-black/20 liquid-panel w-full sm:w-auto max-w-4xl mx-auto">
              <button
                onClick={() => setAppMode('extractor')}
                className="group flex flex-col items-center gap-2 md:gap-3 transition-all duration-300 active:scale-95 relative"
              >
                <div className={`w-12 h-12 md:w-16 md:h-16 rounded-full flex items-center justify-center transition-all duration-500 border border-white/10 ${
                  appMode === 'extractor'
                    ? 'bg-white text-black shadow-[0_0_50px_rgba(255,255,255,0.7)] scale-105 z-10'
                    : 'bg-black/40 text-white hover:bg-black/60 z-0'
                }`}>
                  <FileText className="w-5 h-5 md:w-7 md:h-7" />
                </div>
                <span className={`text-[10px] md:text-xs font-medium transition-colors text-center ${appMode === 'extractor' ? 'text-white' : 'text-zinc-400'}`}>
                  {t.extractorMode}
                </span>
              </button>
              
              <button
                onClick={() => setAppMode('audio-tutor')}
                className="group flex flex-col items-center gap-2 md:gap-3 transition-all duration-300 active:scale-95 relative"
              >
                <div className={`w-12 h-12 md:w-16 md:h-16 rounded-full flex items-center justify-center transition-all duration-500 border border-white/10 ${
                  appMode === 'audio-tutor'
                    ? 'bg-white text-black shadow-[0_0_50px_rgba(255,255,255,0.7)] scale-105 z-10'
                    : 'bg-black/40 text-white hover:bg-black/60 z-0'
                }`}>
                  <Headphones className="w-5 h-5 md:w-7 md:h-7" />
                </div>
                <span className={`text-[10px] md:text-xs font-medium transition-colors text-center ${appMode === 'audio-tutor' ? 'text-white' : 'text-zinc-400'}`}>
                  {t.audioTutorMode}
                </span>
              </button>

              <button
                onClick={() => setAppMode('grapher')}
                className="group flex flex-col items-center gap-2 md:gap-3 transition-all duration-300 active:scale-95 relative"
              >
                <div className={`w-12 h-12 md:w-16 md:h-16 rounded-full flex items-center justify-center transition-all duration-500 border border-white/10 ${
                  appMode === 'grapher'
                    ? 'bg-white text-black shadow-[0_0_50px_rgba(255,255,255,0.7)] scale-105 z-10'
                    : 'bg-black/40 text-white hover:bg-black/60 z-0'
                }`}>
                  <LineChart className="w-5 h-5 md:w-7 md:h-7" />
                </div>
                <span className={`text-[10px] md:text-xs font-medium transition-colors text-center ${appMode === 'grapher' ? 'text-white' : 'text-zinc-400'}`}>
                  {t.grapherMode}
                </span>
              </button>

              <button
                onClick={() => setAppMode('reading-coach')}
                className="group flex flex-col items-center gap-2 md:gap-3 transition-all duration-300 active:scale-95 relative"
              >
                <div className={`w-12 h-12 md:w-16 md:h-16 rounded-full flex items-center justify-center transition-all duration-500 border border-white/10 ${
                  appMode === 'reading-coach'
                    ? 'bg-white text-black shadow-[0_0_50px_rgba(255,255,255,0.7)] scale-105 z-10'
                    : 'bg-black/40 text-white hover:bg-black/60 z-0'
                }`}>
                  <BookOpen className="w-5 h-5 md:w-7 md:h-7" />
                </div>
                <span className={`text-[10px] md:text-xs font-medium transition-colors text-center ${appMode === 'reading-coach' ? 'text-white' : 'text-zinc-400'}`}>
                  {language === 'zh' ? '朗读纠错' : 'Reading Coach'}
                </span>
              </button>

              <button
                onClick={() => setAppMode('material-assistant')}
                className="group flex flex-col items-center gap-2 md:gap-3 transition-all duration-300 active:scale-95 relative"
              >
                <div className={`w-12 h-12 md:w-16 md:h-16 rounded-full flex items-center justify-center transition-all duration-500 border border-white/10 ${
                  appMode === 'material-assistant'
                    ? 'bg-white text-black shadow-[0_0_50px_rgba(255,255,255,0.7)] scale-105 z-10'
                    : 'bg-black/40 text-white hover:bg-black/60 z-0'
                }`}>
                  <Book className="w-5 h-5 md:w-7 md:h-7" />
                </div>
                <span className={`text-[10px] md:text-xs font-medium transition-colors text-center ${appMode === 'material-assistant' ? 'text-white' : 'text-zinc-400'}`}>
                  {language === 'zh' ? '语文素材' : 'Materials'}
                </span>
              </button>

              <button
                onClick={() => setAppMode('essay-feedback')}
                className="group flex flex-col items-center gap-2 md:gap-3 transition-all duration-300 active:scale-95 relative"
              >
                <div className={`w-12 h-12 md:w-16 md:h-16 rounded-full flex items-center justify-center transition-all duration-500 border border-white/10 ${
                  appMode === 'essay-feedback'
                    ? 'bg-white text-black shadow-[0_0_50px_rgba(255,255,255,0.7)] scale-105 z-10'
                    : 'bg-black/40 text-white hover:bg-black/60 z-0'
                }`}>
                  <PenTool className="w-5 h-5 md:w-7 md:h-7" />
                </div>
                <span className={`text-[10px] md:text-xs font-medium transition-colors text-center ${appMode === 'essay-feedback' ? 'text-white' : 'text-zinc-400'}`}>
                  {language === 'zh' ? '作文讲评' : 'Essay Feedback'}
                </span>
              </button>

              <button
                onClick={() => setAppMode('zhang-jingyang')}
                className="group flex flex-col items-center gap-2 md:gap-3 transition-all duration-300 active:scale-95 relative"
              >
                <div className={`w-12 h-12 md:w-16 md:h-16 rounded-full flex items-center justify-center transition-all duration-500 border border-white/10 ${
                  appMode === 'zhang-jingyang'
                    ? 'bg-white text-black shadow-[0_0_50px_rgba(255,255,255,0.7)] scale-105 z-10'
                    : 'bg-black/40 text-white hover:bg-black/60 z-0'
                }`}>
                  <MessageCircle className="w-5 h-5 md:w-7 md:h-7" />
                </div>
                <span className={`text-[10px] md:text-xs font-medium transition-colors text-center ${appMode === 'zhang-jingyang' ? 'text-white' : 'text-zinc-400'}`}>
                  {language === 'zh' ? '张景洋模式' : 'Zhang Jingyang'}
                </span>
              </button>

              <button
                onClick={() => setAppMode('organic-chemistry')}
                className="group flex flex-col items-center gap-2 md:gap-3 transition-all duration-300 active:scale-95 relative"
              >
                <div className={`w-12 h-12 md:w-16 md:h-16 rounded-full flex items-center justify-center transition-all duration-500 border border-white/10 ${
                  appMode === 'organic-chemistry'
                    ? 'bg-white text-black shadow-[0_0_50px_rgba(255,255,255,0.7)] scale-105 z-10'
                    : 'bg-black/40 text-white hover:bg-black/60 z-0'
                }`}>
                  <Beaker className="w-5 h-5 md:w-7 md:h-7" />
                </div>
                <span className={`text-[10px] md:text-xs font-medium transition-colors text-center ${appMode === 'organic-chemistry' ? 'text-white' : 'text-zinc-400'}`}>
                  {language === 'zh' ? '有机大题' : 'Organic'}
                </span>
              </button>
            </div>
          </div>

          {/* Model Selection */}
          {appMode !== 'reading-coach' && appMode !== 'grapher' && appMode !== 'zhang-jingyang' && appMode !== 'organic-chemistry' && (
            <div className="grid grid-cols-2 md:flex md:flex-nowrap gap-3 md:gap-4 justify-center py-2">
              {MODELS.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setSelectedModel(m.id)}
                  className={`relative group transition-all duration-300 active:scale-95`}
                >
                  <div className={`px-4 md:px-6 py-2.5 md:py-3 rounded-full flex items-center justify-center transition-all duration-500 border border-white/10 backdrop-blur-md ${
                    selectedModel === m.id 
                      ? 'bg-white text-black shadow-[0_0_30px_rgba(255,255,255,0.5)] scale-105' 
                      : 'bg-black/40 text-zinc-400 hover:text-white hover:bg-black/60'
                  }`}>
                    <span className="font-bold text-[10px] md:text-xs tracking-wide">{m.name}</span>
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Textbook Association Section */}
          {appMode !== 'reading-coach' && appMode !== 'grapher' && appMode !== 'material-assistant' && appMode !== 'essay-feedback' && appMode !== 'organic-chemistry' && appMode !== 'zhang-jingyang' && (
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 p-4 rounded-3xl border border-white/5 backdrop-blur-3xl shadow-[0_8px_32px_rgba(0,0,0,0.4)] bg-black/20 liquid-panel">
              <div className="flex flex-col md:flex-row md:items-center gap-4">
                {(appMode === 'audio-tutor' || appMode === 'extractor') && (
                  <>
                    <label className="flex items-center gap-3 cursor-pointer group">
                      <div className={`w-6 h-6 rounded-full border flex items-center justify-center transition-all duration-300 ${associateTextbook ? 'bg-white border-white shadow-[0_0_15px_rgba(255,255,255,0.4)]' : 'border-white/20 group-hover:border-white/50 bg-black/40'}`}>
                        {associateTextbook && <Check className="w-3.5 h-3.5 text-black" />}
                      </div>
                      <input 
                        type="checkbox" 
                        className="hidden" 
                        checked={associateTextbook} 
                        onChange={(e) => setAssociateTextbook(e.target.checked)} 
                      />
                      <span className="text-sm font-medium text-zinc-300 group-hover:text-white transition-colors">
                        {t.associateTextbook}
                      </span>
                    </label>
                    
                    {associateTextbook && (
                      <div className="flex flex-col gap-3 mt-3 md:mt-0 w-full">
                        {textbookGroups.map(group => {
                          const groupBooks = textbooks.filter(b => b.groupId === group.id);
                          if (groupBooks.length === 0) return null;
                          const allGroupSelected = groupBooks.every(b => selectedTextbookIds.includes(b.id));
                          
                          return (
                            <div key={group.id} className="flex flex-col gap-2 p-3 rounded-2xl bg-white/5 border border-white/10">
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-bold text-zinc-400 flex items-center gap-1.5">
                                  <Folder className="w-3.5 h-3.5" />
                                  {group.name}
                                </span>
                                <button 
                                  onClick={() => {
                                    if (allGroupSelected) {
                                      setSelectedTextbookIds(prev => prev.filter(id => !groupBooks.find(b => b.id === id)));
                                    } else {
                                      const newIds = [...selectedTextbookIds];
                                      groupBooks.forEach(b => {
                                        if (!newIds.includes(b.id)) newIds.push(b.id);
                                      });
                                      setSelectedTextbookIds(newIds);
                                    }
                                  }}
                                  className="text-[10px] text-blue-400 hover:text-blue-300 transition-colors"
                                >
                                  {allGroupSelected ? (language === 'zh' ? '取消全选' : 'Deselect All') : (language === 'zh' ? '全选' : 'Select All')}
                                </button>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                {groupBooks.map(book => {
                                  const isSelected = selectedTextbookIds.includes(book.id);
                                  return (
                                    <button
                                      key={book.id}
                                      onClick={() => {
                                        if (isSelected) {
                                          setSelectedTextbookIds(prev => prev.filter(id => id !== book.id));
                                        } else {
                                          setSelectedTextbookIds(prev => [...prev, book.id]);
                                        }
                                      }}
                                      className={`px-3 py-1 text-xs font-medium rounded-full border transition-all ${
                                        isSelected 
                                          ? 'bg-white text-black border-white shadow-[0_0_15px_rgba(255,255,255,0.4)]' 
                                          : 'bg-black/40 border-white/10 text-zinc-400 hover:text-white hover:bg-white/10'
                                      }`}
                                    >
                                      {book.name}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                        
                        {/* Render books without a group */}
                        {(() => {
                          const ungroupedBooks = textbooks.filter(b => !b.groupId);
                          if (ungroupedBooks.length === 0) return null;
                          return (
                            <div className="flex flex-wrap gap-2">
                              {ungroupedBooks.map(book => {
                                const isSelected = selectedTextbookIds.includes(book.id);
                                return (
                                  <button
                                    key={book.id}
                                    onClick={() => {
                                      if (isSelected) {
                                        setSelectedTextbookIds(prev => prev.filter(id => id !== book.id));
                                      } else {
                                        setSelectedTextbookIds(prev => [...prev, book.id]);
                                      }
                                    }}
                                    className={`px-3 py-1 text-xs font-medium rounded-full border transition-all ${
                                      isSelected 
                                        ? 'bg-white text-black border-white shadow-[0_0_15px_rgba(255,255,255,0.4)]' 
                                        : 'bg-black/40 border-white/10 text-zinc-400 hover:text-white hover:bg-white/10'
                                    }`}
                                  >
                                    {book.name}
                                  </button>
                                );
                              })}
                            </div>
                          );
                        })()}
                      </div>
                    )}
                  </>
                )}
              </div>
              
              {isAdmin && (
                <button 
                  onClick={() => setShowTextbookManager(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-black/40 hover:bg-white/10 border border-white/10 hover:border-white/30 rounded-full text-sm text-zinc-300 hover:text-white transition-all shadow-lg active:scale-95"
                >
                  <Book className="w-4 h-4" />
                  {t.manageTextbooks}
                </button>
              )}
            </div>
          )}


          <div className={appMode === 'grapher' ? 'block flex-1 flex flex-col h-full' : 'hidden'}>
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="flex-1 flex flex-col gap-6"
            >
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1">
                {/* Right Panel: Graph */}
                <div className="lg:col-span-8 flex flex-col gap-4 h-[350px] md:h-[500px]">
                  <div className="flex-1 relative">
                    <GraphView 
                      key={clearKey}
                      functions={graphFunctions.filter(f => f.visible).map(f => ({ expression: f.expression, color: f.color }))} 
                      parameters={graphParameters}
                      onSave={handleSaveGraph}
                    />
                  </div>
                </div>

                {/* Left Panel: Controls */}
                <div className="lg:col-span-4 flex flex-col gap-4">
                  {/* Function List */}
                  <div className="p-4 rounded-3xl border border-white/10 bg-black/40 backdrop-blur-xl shadow-2xl liquid-panel overflow-y-auto max-h-[500px] custom-scrollbar">
                    <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-4">{language === 'zh' ? '函数列表' : 'Functions'}</h3>
                    <div className="space-y-4">
                      {graphFunctions.map((f) => {
                        const normalized = normalizeMathExpression(f.expression);
                        const processed = splitImplicitMultiplication(normalized);
                        const usedParams: string[] = [];
                        try {
                          const node = math.parse(processed);
                          node.traverse((n: any) => {
                            if (n.type === 'SymbolNode' && graphParameters[n.name]) {
                              if (!usedParams.includes(n.name)) usedParams.push(n.name);
                            }
                          });
                        } catch(e) {}

                        return (
                          <div key={f.id} className="group p-4 rounded-2xl bg-white/5 border border-white/5 hover:border-white/20 transition-all space-y-4">
                            <div className="flex items-center justify-between gap-3">
                              <div className="flex items-center gap-3 flex-1 overflow-hidden">
                                <div className="relative flex items-center justify-center w-5 h-5">
                                  <div 
                                    className={`w-3 h-3 rounded-full ${f.visible ? '' : 'opacity-30'}`}
                                    style={{ backgroundColor: f.color }}
                                  />
                                </div>
                                <div className="flex-1 overflow-hidden">
                                  <InlineMath math={toGraphLatex(f.expression)} />
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <button 
                                  onClick={() => setGraphFunctions(graphFunctions.map(func => func.id === f.id ? { ...func, visible: !func.visible } : func))}
                                  className={`p-2 rounded-xl transition-all border ${f.visible ? 'bg-white/5 text-zinc-400 hover:text-white border-white/5' : 'bg-white/10 text-white border-white/20'}`}
                                  title={language === 'zh' ? (f.visible ? '隐藏' : '显示') : (f.visible ? 'Hide' : 'Show')}
                                >
                                  {f.visible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                                </button>
                                <button 
                                  onClick={() => setGraphShowColorPicker(graphShowColorPicker === f.id ? null : f.id)}
                                  className={`p-2 rounded-xl transition-all border ${graphShowColorPicker === f.id ? 'bg-white text-black border-white' : 'bg-white/5 text-zinc-400 hover:text-white border-white/5'}`}
                                  style={{ color: graphShowColorPicker === f.id ? undefined : f.color }}
                                  title={language === 'zh' ? '颜色' : 'Color'}
                                >
                                  <Palette className="w-4 h-4" />
                                </button>
                                <button 
                                  onClick={() => { setGraphInputValue(f.expression); setGraphEditingId(f.id); setGraphActiveTab('manual'); }}
                                  className="p-2 bg-white/5 hover:bg-white/10 rounded-xl text-zinc-400 hover:text-white transition-all border border-white/5"
                                  title={language === 'zh' ? '编辑' : 'Edit'}
                                >
                                  <Edit2 className="w-4 h-4" />
                                </button>
                                <button 
                                  onClick={() => setGraphFunctions(graphFunctions.filter(func => func.id !== f.id))}
                                  className="p-2 bg-red-500/10 hover:bg-red-500/20 rounded-xl text-zinc-400 hover:text-red-400 transition-all border border-red-500/10"
                                  title={language === 'zh' ? '删除' : 'Delete'}
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </div>

                            <AnimatePresence>
                              {graphShowColorPicker === f.id && (
                                <motion.div 
                                  initial={{ opacity: 0, height: 0 }}
                                  animate={{ opacity: 1, height: 'auto' }}
                                  exit={{ opacity: 0, height: 0 }}
                                  className="overflow-hidden"
                                >
                                  <div className="flex flex-wrap gap-2 py-3 border-t border-white/5">
                                    {COLORS.map(color => (
                                      <button
                                        key={color}
                                        onClick={() => {
                                          setGraphFunctions(graphFunctions.map(func => func.id === f.id ? { ...func, color } : func));
                                          setGraphShowColorPicker(null);
                                        }}
                                        className={`w-6 h-6 rounded-full border-2 transition-all ${f.color === color ? 'scale-110 border-white shadow-[0_0_15px_rgba(255,255,255,0.3)]' : 'border-transparent opacity-60 hover:opacity-100 hover:scale-110'}`}
                                        style={{ backgroundColor: color }}
                                      />
                                    ))}
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>

                            {usedParams.length > 0 && (
                              <div className="space-y-4 pt-2 border-t border-white/5">
                                {usedParams.map(paramName => {
                                  const p = graphParameters[paramName];
                                  if (!p) return null;
                                  return (
                                    <div key={p.name} className="space-y-2">
                                      <div className="flex items-center justify-between">
                                        <span className="text-[10px] font-mono text-zinc-400 tracking-widest">{p.name} = {p.value.toFixed(2)}</span>
                                        <button onClick={() => {
                                          const next = { ...graphParameters };
                                          delete next[p.name];
                                          setGraphParameters(next);
                                        }} className="p-1 hover:bg-white/10 rounded text-zinc-500 hover:text-white">
                                          <X className="w-3 h-3" />
                                        </button>
                                      </div>
                                      <input 
                                        type="range" 
                                        min={p.min} 
                                        max={p.max} 
                                        step={p.step} 
                                        value={p.value ?? 0}
                                        onChange={(e) => setGraphParameters({ ...graphParameters, [p.name]: { ...p, value: parseFloat(e.target.value) } })}
                                        className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-white"
                                      />
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                      {graphFunctions.length === 0 && (
                        <div className="text-center py-8 text-zinc-600">
                          <LineChart className="w-8 h-8 mx-auto mb-2 opacity-20" />
                          <p className="text-xs">{language === 'zh' ? '暂无函数' : 'No functions yet'}</p>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="p-4 rounded-3xl border border-white/10 bg-black/40 backdrop-blur-xl shadow-2xl liquid-panel flex flex-col gap-4">
                    <div className="flex bg-white/5 p-1 rounded-2xl gap-1">
                      <button 
                        onClick={() => setGraphActiveTab('manual')}
                        className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-bold transition-all ${graphActiveTab === 'manual' ? 'bg-white text-black shadow-lg' : 'text-zinc-500 hover:bg-white/5'}`}
                      >
                        <Keyboard className="w-4 h-4" />
                        {language === 'zh' ? '手动输入' : 'Manual'}
                      </button>
                      <button 
                        onClick={() => setGraphActiveTab('photo')}
                        className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-bold transition-all ${graphActiveTab === 'photo' ? 'bg-white text-black shadow-lg' : 'text-zinc-500 hover:bg-white/5'}`}
                      >
                        <Camera className="w-4 h-4" />
                        {language === 'zh' ? '拍照识别' : 'Photo Scan'}
                      </button>
                    </div>

                    {graphActiveTab === 'manual' ? (
                      <div className="space-y-4">
                        <div className="relative group">
                          <input
                            ref={graphInputRef}
                            type="text"
                            inputMode="none"
                            value={graphInputValue || ''}
                            onChange={(e) => setGraphInputValue(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && addGraphFunction(graphInputValue)}
                            placeholder={language === 'zh' ? '输入函数, 如: y = x^2' : 'Enter function, e.g., y = x^2'}
                            className="w-full bg-black/60 border border-white/10 rounded-2xl px-4 py-3 text-white placeholder:text-zinc-600 focus:outline-none focus:border-white/30 transition-all font-mono text-sm"
                          />
                          <button 
                            onClick={() => addGraphFunction(graphInputValue)}
                            className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-white text-black rounded-xl hover:bg-zinc-200 transition-all active:scale-95"
                          >
                            <Plus className="w-4 h-4" />
                          </button>
                        </div>
                        <MathKeyboard 
                          onKeyClick={insertAtGraphCursor}
                          onDelete={deleteAtGraphCursor}
                          onClear={() => setGraphInputValue('')}
                          onMoveCursor={moveGraphCursor}
                        />
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {/* Model Selection */}
                        <div className="flex flex-col gap-2 p-3 rounded-2xl bg-white/5 border border-white/5">
                          <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest px-1">
                            {language === 'zh' ? '识别模型与推理等级' : 'Model & Thinking Level'}
                          </label>
                          <div className="grid grid-cols-3 gap-2">
                            <button
                              onClick={() => setGraphScanMode('gemini-3.1-flash-lite-low')}
                              className={`flex flex-col items-start p-3 rounded-xl border transition-all ${
                                graphScanMode === 'gemini-3.1-flash-lite-low'
                                  ? 'bg-white text-black border-white shadow-lg'
                                  : 'bg-white/5 text-zinc-400 border-white/5 hover:bg-white/10'
                              }`}
                            >
                              <span className="text-xs font-bold">Gemini 3.1 Flash Lite</span>
                              <span className={`text-[10px] ${graphScanMode === 'gemini-3.1-flash-lite-low' ? 'text-zinc-600' : 'text-zinc-500'}`}>
                                Low Level (Fast)
                              </span>
                            </button>
                            <button
                              onClick={() => setGraphScanMode('gemini-3-flash-high')}
                              className={`flex flex-col items-start p-3 rounded-xl border transition-all ${
                                graphScanMode === 'gemini-3-flash-high'
                                  ? 'bg-white text-black border-white shadow-lg'
                                  : 'bg-white/5 text-zinc-400 border-white/5 hover:bg-white/10'
                              }`}
                            >
                              <span className="text-xs font-bold">Gemini 3 Flash</span>
                              <span className={`text-[10px] ${graphScanMode === 'gemini-3-flash-high' ? 'text-zinc-600' : 'text-zinc-500'}`}>
                                High Level (Precise)
                              </span>
                            </button>
                            <button
                              onClick={() => setGraphScanMode('gemini-3.1-pro-preview')}
                              className={`flex flex-col items-start p-3 rounded-xl border transition-all ${
                                graphScanMode === 'gemini-3.1-pro-preview'
                                  ? 'bg-white text-black border-white shadow-lg'
                                  : 'bg-white/5 text-zinc-400 border-white/5 hover:bg-white/10'
                              }`}
                            >
                              <span className="text-xs font-bold">Gemini 3.1 Pro</span>
                              <span className={`text-[10px] ${graphScanMode === 'gemini-3.1-pro-preview' ? 'text-zinc-600' : 'text-zinc-500'}`}>
                                Advanced (Complex)
                              </span>
                            </button>
                          </div>
                        </div>

                        <div 
                          onClick={() => graphFileInputRef.current?.click()}
                          className="border-2 border-dashed border-white/10 rounded-3xl p-8 text-center cursor-pointer hover:border-white/30 hover:bg-white/5 transition-all group relative overflow-hidden"
                        >
                          <input type="file" ref={graphFileInputRef} onChange={handleGraphFileUpload} accept="image/*" className="hidden" />
                          {graphIsScanning ? (
                            <div className="flex flex-col items-center gap-3">
                              <Loader2 className="w-8 h-8 animate-spin text-white" />
                              <p className="text-sm font-medium text-zinc-300">{language === 'zh' ? '正在识别函数...' : 'Scanning functions...'}</p>
                            </div>
                          ) : (
                            <div className="flex flex-col items-center gap-3">
                              <div className="p-4 rounded-full bg-white/5 text-zinc-400 group-hover:bg-white group-hover:text-black transition-all shadow-lg">
                                <ImageIcon className="w-8 h-8" />
                              </div>
                              <p className="text-sm font-medium text-zinc-300">{language === 'zh' ? '点击上传或拖拽图片' : 'Click to upload or drag image'}</p>
                            </div>
                          )}
                        </div>

                        {graphLastImageData && !graphIsScanning && (
                          <button
                            onClick={regenerateGraphFunctions}
                            className="w-full flex items-center justify-center gap-2 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl text-xs font-bold text-zinc-300 transition-all active:scale-[0.98]"
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                            {language === 'zh' ? '重新识别当前图片' : 'Regenerate from Current Image'}
                          </button>
                        )}

                        {graphScannedResults.length > 0 && (
                          <div className="space-y-3">
                            <div className="flex items-center justify-between">
                              <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest">{language === 'zh' ? '识别结果' : 'Scanned Results'}</p>
                              <div className="flex items-center gap-2">
                                <button 
                                  onClick={() => {
                                    if (graphSelectedIndices.size === graphScannedResults.length) {
                                      setGraphSelectedIndices(new Set());
                                    } else {
                                      setGraphSelectedIndices(new Set(graphScannedResults.map((_, i) => i)));
                                    }
                                  }}
                                  className="text-xs font-bold text-zinc-400 hover:text-white px-3 py-1 rounded-full hover:bg-white/10 transition-all"
                                >
                                  {language === 'zh' ? (graphSelectedIndices.size === graphScannedResults.length ? '取消全选' : '全选') : (graphSelectedIndices.size === graphScannedResults.length ? 'Deselect All' : 'Select All')}
                                </button>
                                <button 
                                  onClick={() => {
                                    graphScannedResults.forEach((res, i) => {
                                      if (graphSelectedIndices.has(i)) addGraphFunction(res);
                                    });
                                    setGraphActiveTab('manual');
                                  }}
                                  className="text-xs font-bold text-white bg-white/10 px-3 py-1 rounded-full hover:bg-white hover:text-black transition-all"
                                >
                                  {language === 'zh' ? '添加选中' : 'Add Selected'}
                                </button>
                              </div>
                            </div>
                            <div className="max-h-48 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                              {graphScannedResults.map((res, i) => (
                                <div 
                                  key={i} 
                                  onClick={() => {
                                    const next = new Set(graphSelectedIndices);
                                    if (next.has(i)) next.delete(i); else next.add(i);
                                    setGraphSelectedIndices(next);
                                  }}
                                  className={`p-3 rounded-xl border cursor-pointer transition-all flex items-center justify-between ${graphSelectedIndices.has(i) ? 'bg-white/10 border-white/30' : 'bg-black/20 border-white/5 opacity-50'}`}
                                >
                                  <div className="flex-1 overflow-hidden">
                                    <InlineMath math={toGraphLatex(res)} />
                                  </div>
                                  {graphSelectedIndices.has(i) && <Check className="w-4 h-4 text-white shrink-0" />}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          </div>

          <div className={appMode === 'material-assistant' ? 'block flex-1 flex flex-col' : 'hidden'}>
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="flex-1 flex flex-col"
            >
              <div className="flex-1 min-h-[50vh] md:min-h-[70vh] rounded-2xl overflow-hidden border border-white/10 shadow-2xl bg-black/20 backdrop-blur-3xl liquid-panel">
                <MaterialAssistant 
                  key={clearKey}
                  lang={language} 
                  materials={materials} 
                  groups={materialGroups}
                  onManageMaterials={() => setShowMaterialManager(true)}
                  onSaveHistory={saveHistory}
                  initialData={materialAssistantData}
                  isAdmin={isAdmin}
                />
              </div>
            </motion.div>
          </div>

          <div className={appMode === 'essay-feedback' ? 'block flex-1 flex flex-col' : 'hidden'}>
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="flex-1 flex flex-col"
            >
              <div className="flex-1 min-h-[50vh] md:min-h-[70vh] rounded-2xl overflow-hidden border border-white/10 shadow-2xl bg-black/20 backdrop-blur-3xl liquid-panel">
                <EssayFeedback 
                  key={clearKey}
                  lang={language} 
                  onSaveHistory={saveHistory}
                  initialData={essayFeedbackData}
                  materials={materials}
                  groups={materialGroups}
                  onManageMaterials={() => setShowMaterialManager(true)}
                  selectedModel={selectedModel}
                  isAdmin={isAdmin}
                />
              </div>
            </motion.div>
          </div>

          <div className={appMode === 'audio-tutor' ? 'block flex-1 flex flex-col' : 'hidden'}>
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="flex-1 flex flex-col"
            >
              <AudioTutorView 
                key={clearKey}
                files={files} 
                setFiles={setFiles} 
                lang={language} 
                associateTextbook={associateTextbook}
                selectedTextbookIds={selectedTextbookIds}
                textbooks={textbooks}
                onSaveHistory={saveHistory}
              />
            </motion.div>
          </div>

          <div className={appMode === 'zhang-jingyang' ? 'block flex-1 flex flex-col' : 'hidden'}>
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="flex-1 flex flex-col"
            >
              <div className="flex-1 min-h-0 bg-black/40 backdrop-blur-xl border border-white/10 rounded-3xl overflow-hidden shadow-2xl">
                <ZhangJingyangMode 
                  key={clearKey}
                  lang={language} 
                  onSaveHistory={saveHistory} 
                  initialData={zhangJingyangData}
                />
              </div>
            </motion.div>
          </div>

          <div className={appMode === 'organic-chemistry' ? 'block flex-1 flex flex-col' : 'hidden'}>
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="flex-1 flex flex-col"
            >
              <div className="flex-1 min-h-0 bg-black/40 backdrop-blur-xl border border-white/10 rounded-3xl overflow-hidden shadow-2xl">
                <OrganicChemistryMode 
                  key={clearKey}
                  lang={language} 
                  model={selectedModel} 
                  initialData={organicChemistryData}
                  onSaveHistory={saveHistory}
                />
              </div>
            </motion.div>
          </div>

          <div className={appMode === 'reading-coach' ? 'block flex-1 flex flex-col' : 'hidden'}>
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="flex-1 flex flex-col"
            >
              <div className="flex-1 min-h-[50vh] md:min-h-[70vh] rounded-2xl overflow-hidden border border-white/10 shadow-2xl">
                <ReadingCoach key={clearKey} lang={language} onSaveHistory={saveHistory} />
              </div>
            </motion.div>
          </div>

          <div className={appMode === 'extractor' ? 'block flex-1 flex flex-col' : 'hidden'}>
            <AnimatePresence mode="wait">
              {selectedIdx === null ? (
                <motion.div
                  key="extractor-list"
                  initial={{ opacity: 0, y: -20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 20 }}
                  transition={{ duration: 0.3 }}
                  className="flex-1 flex flex-col"
                >
                  {/* Model & Upload Section */}
                  <div className="p-1 rounded-2xl border border-white/10 backdrop-blur-2xl shadow-2xl liquid-panel">
                    <div className="p-3 md:p-4 rounded-xl border border-white/5 backdrop-blur-2xl space-y-4 liquid-panel">
                      
                      {/* Hidden Inputs */}
                      <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/*" multiple className="hidden" />
                      <input type="file" ref={cameraInputRef} onChange={handleFileChange} accept="image/*" capture="environment" multiple className="hidden" />

                      {files.length === 0 ? (
                        <div className="flex flex-row gap-3">
                          <div
                            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                            onDragLeave={() => setIsDragging(false)}
                            onDrop={(e) => { e.preventDefault(); setIsDragging(false); if (e.dataTransfer.files) processFiles(e.dataTransfer.files); }}
                            onClick={() => fileInputRef.current?.click()}
                            className={`
                              flex-1 relative border border-white/10 rounded-2xl md:rounded-3xl p-4 md:p-8 text-center cursor-pointer transition-all duration-500
                              ${isDragging ? 'bg-white text-black scale-[0.99] shadow-[0_0_50px_rgba(255,255,255,0.5)]' : 'bg-black/20 hover:bg-black/40 hover:border-white/30'}
                            `}
                          >
                            <div className="flex flex-col items-center gap-2 md:gap-4">
                              <div className={`p-2.5 md:p-4 rounded-full transition-all duration-500 ${isDragging ? 'bg-black text-white' : 'bg-white/5 text-zinc-400 group-hover:bg-white group-hover:text-black shadow-[0_0_20px_rgba(255,255,255,0.1)]'}`}>
                                <Upload className="w-5 h-5 md:w-8 md:h-8" />
                              </div>
                              <p className={`text-[10px] md:text-sm font-medium transition-colors ${isDragging ? 'text-black' : 'text-zinc-300'}`}>{t.upload}</p>
                            </div>
                          </div>

                          <div
                            onClick={() => cameraInputRef.current?.click()}
                            className="flex-1 md:w-48 relative border border-white/10 rounded-2xl md:rounded-3xl p-4 md:p-8 text-center cursor-pointer bg-black/20 hover:bg-black/40 hover:border-white/30 transition-all duration-500 group"
                          >
                            <div className="flex flex-col items-center gap-2 md:gap-4">
                              <div className="p-2.5 md:p-4 rounded-full bg-white/5 text-zinc-400 group-hover:bg-white group-hover:text-black transition-all duration-500 shadow-[0_0_20px_rgba(255,255,255,0.1)]">
                                <Camera className="w-5 h-5 md:w-8 md:h-8" />
                              </div>
                              <p className="text-zinc-300 text-[10px] md:text-sm font-medium">{t.camera}</p>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-col gap-4">
                          <div className="flex gap-2 overflow-x-auto pb-1 custom-scrollbar">
                            {previewUrls.map((url, idx) => (
                              <div key={idx} className="relative w-24 md:w-28 aspect-[3/4] bg-black/50 rounded-lg overflow-hidden border border-white/10 group shrink-0 shadow-xl">
                                <img src={url} alt={`Preview ${idx}`} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" />
                                <button onClick={() => removeFile(idx)} className="absolute top-1 right-1 p-1 bg-black/60 backdrop-blur-md text-zinc-300 rounded-full hover:bg-red-500 hover:text-white transition-all shadow-lg">
                                  <Trash2 className="w-2 h-2" />
                                </button>
                              </div>
                            ))}
                            <button 
                              onClick={() => fileInputRef.current?.click()}
                              className="w-24 md:w-28 aspect-[3/4] rounded-lg border-2 border-dashed border-white/20 flex flex-col items-center justify-center gap-1 hover:border-white/40 hover:bg-white/5 transition-all shrink-0 cursor-pointer text-zinc-400 hover:text-white"
                            >
                              <Upload className="w-4 h-4" />
                              <span className="text-[8px] font-medium">{t.add}</span>
                            </button>
                          </div>
                          
                          <div className="flex flex-col justify-center gap-3 w-full">
                            <div className="flex items-center gap-2 text-zinc-300 p-3 rounded-lg border border-white/10 liquid-panel">
                              <FileImage className="w-3.5 h-3.5 text-zinc-500" />
                              <span className="font-medium truncate text-[10px]">{t.selected} {files.length} {language === 'zh' ? '张' : 'images'}</span>
                            </div>
                            
                            <div className="flex gap-2">
                              <button
                                onClick={clearFiles}
                                className="px-4 py-2.5 text-white text-xs font-bold rounded-lg hover:bg-red-500/20 hover:text-red-400 border border-white/10 hover:border-red-500/50 transition-all active:scale-[0.98] liquid-button"
                              >
                                {t.clear}
                              </button>
                              <button
                                onClick={extractQuestions}
                                disabled={loading}
                                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-white text-black text-xs font-bold rounded-lg hover:bg-zinc-200 disabled:opacity-50 transition-all active:scale-[0.98] shadow-[0_0_10px_rgba(255,255,255,0.1)]"
                              >
                                {loading ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> {t.parsing}</> : <><Upload className="w-3.5 h-3.5" /> {t.start}</>}
                              </button>
                            </div>
                            
                            {error && (
                              <div className="flex flex-col gap-3 p-4 text-xs text-red-400 bg-red-950/20 rounded-xl border border-red-900/30">
                                <div className="flex items-start gap-3">
                                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                                  <p className="break-all">{error}</p>
                                </div>
                                <button
                                  onClick={extractQuestions}
                                  className="self-end px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 rounded-md text-red-400 font-bold transition-all"
                                >
                                  {t.retry}
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Preview List Section */}
                  <AnimatePresence>
                    {questions.length > 0 && (
                      <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="space-y-6"
                      >
                        <div className="flex items-center justify-between px-4">
                          <h2 className="text-xl font-bold text-white">{t.preview}</h2>
                          <div className="flex items-center gap-3">
                            <button
                              onClick={extractQuestions}
                              disabled={loading}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-[10px] text-zinc-300 font-bold uppercase tracking-wider transition-all active:scale-95 disabled:opacity-50"
                            >
                              {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                              {language === 'zh' ? '重新生成' : 'Regenerate'}
                            </button>
                            <span className="px-3 py-1 bg-zinc-800 rounded-full text-[10px] text-zinc-400 font-bold uppercase tracking-widest">
                              {questions.length} {t.ready}
                            </span>
                          </div>
                        </div>
                        
                        <div className="grid gap-4">
                          {questions.map((q, idx) => (
                            <QuestionListItem 
                              key={idx} 
                              data={q} 
                              index={idx} 
                              onClick={() => setSelectedIdx(idx)} 
                              lang={language}
                            />
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              ) : (
                <motion.div
                  key="extractor-detail"
                  initial={{ opacity: 0, y: -20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 20 }}
                  transition={{ duration: 0.3 }}
                  className="flex-1 flex flex-col"
                >
                  <QuestionDetail 
                    data={questions[selectedIdx]} 
                    onBack={() => setSelectedIdx(null)} 
                    onNext={() => setSelectedIdx(prev => prev !== null ? prev + 1 : null)}
                    onPrev={() => setSelectedIdx(prev => prev !== null ? prev - 1 : null)}
                    hasNext={selectedIdx < questions.length - 1}
                    hasPrev={selectedIdx > 0}
                    model={selectedModel}
                    setModel={setSelectedModel}
                    lang={language}
                    textbooks={textbooks}
                    groups={textbookGroups}
                    allQuestions={questions}
                    currentIndex={selectedIdx}
                    onSelectQuestion={setSelectedIdx}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </main>
      </div>

      {showTextbookManager && (
        <TextbookManager 
          onClose={() => setShowTextbookManager(false)} 
          lang={language} 
          isAdmin={isAdmin}
          uid={user?.uid}
        />
      )}

      {showMaterialManager && (
        <TextbookManager 
          onClose={() => setShowMaterialManager(false)} 
          lang={language} 
          type="material" 
          isAdmin={true}
          uid={user?.uid}
        />
      )}

      <HistoryDrawer 
        isOpen={isHistoryOpen} 
        onClose={() => setIsHistoryOpen(false)} 
        onSelectRecord={handleSelectHistoryRecord}
        lang={language}
        uid={user?.uid}
      />

      <UserGuideModal
        isOpen={isUserGuideOpen}
        onClose={() => setIsUserGuideOpen(false)}
        lang={language}
      />
      </Suspense>
    </div>
  );
}
