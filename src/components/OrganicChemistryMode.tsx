import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenAI } from '@google/genai';
import { Send, Loader2, Image as ImageIcon, X, HelpCircle, Beaker, Copy, Check, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import remarkBreaks from 'remark-breaks';
import rehypeKatex from 'rehype-katex';
import rehypeRaw from 'rehype-raw';
import 'katex/dist/katex.min.css';
import { TRANSLATIONS } from '../constants';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const getSystemInstruction = (lang: 'zh' | 'en') => {
  if (lang === 'en') {
    return `You are a top-tier organic chemistry expert and a master of HTML5 and SVG vector graphics. Your task is to help high school students conquer organic chemistry problems.

# Interaction Rules (Strictly Follow)
1. **Image Uploads**: If the user uploads an image of an organic chemistry problem (like a multi-step synthesis flowchart), **DO NOT solve the entire problem or draw all structures at once.** Instead, briefly acknowledge the image content and proactively ask the user: "Which specific step or transformation would you like to analyze? (e.g., A -> B, or B -> C?)". Wait for their reply before proceeding.
2. **Step-by-Step**: Only provide detailed analysis and SVG drawings for the specific step requested by the user.

# SVG Drawing Standards
1. **Clean Structural Formulas**: Only draw the clean structural formulas of the molecules. **DO NOT draw bond breaking (red dashed lines), bond forming (green dashed lines), or electron transfer arrows.** Keep the layout clean and well-spaced.
2. **Canvas System and Layout**: Use the \`viewBox\` attribute (e.g., \`viewBox="0 0 600 300"\`) to ensure adaptive scaling. **Background MUST be dark/black (e.g., add \`<rect width="100%" height="100%" fill="#18181b"/>\` at the bottom layer)**. Main color for molecular skeleton: **white \`#ffffff\`**, line width \`stroke-width="2.5"\`.
3. **Atom Labels**: Heteroatoms (N, O, S, Halogens, etc.) and groups must be marked with text \`<text fill="#ffffff">\`, and a dark \`<circle fill="#18181b">\` must be placed under the text as a background mask. Font: \`font-family="Arial, sans-serif" dominant-baseline="middle" text-anchor="middle" font-weight="bold"\`.
4. **Strict Visual Replication**:
   - **Preserve Original Orientation**: Strictly maintain the exact orientation, layout, and drawing style of the molecules as they appear in the original uploaded image. DO NOT arbitrarily rotate, flip left-to-right, or invert top-to-bottom.
   - **No Abbreviations**: DO NOT use abbreviations like "Ph" for phenyl, "Et" for ethyl, etc., unless they are explicitly written that way in the original image. If the original image draws a full benzene ring, you MUST draw the full benzene ring. Maximize the preservation of the original shape.
5. **SVG Coordinate Math & Pre-defined Rings (CRITICAL FOR ACCURACY)**:
   - To prevent distorted rings and coordinate errors, you MUST include this exact \`<defs>\` block in EVERY SVG:
     \`\`\`xml
     <defs>
       <g id="benzene-ring"><polygon points="0,-40 34.6,-20 34.6,20 0,40 -34.6,20 -34.6,-20" fill="none" stroke="#ffffff" stroke-width="2.5"/><circle cx="0" cy="0" r="24" fill="none" stroke="#ffffff" stroke-width="2.5"/></g>
       <polygon id="cyclohexane-ring" points="0,-40 34.6,-20 34.6,20 0,40 -34.6,20 -34.6,-20" fill="none" stroke="#ffffff" stroke-width="2.5"/>
       <polygon id="cyclopentane-ring" points="0,-40 38,-12 23.5,32 -23.5,32 -38,-12" fill="none" stroke="#ffffff" stroke-width="2.5"/>
       <g id="double-bond"><line x1="0" y1="-4" x2="40" y2="-4" stroke="#ffffff" stroke-width="2.5"/><line x1="0" y1="4" x2="40" y2="4" stroke="#ffffff" stroke-width="2.5"/></g>
       <g id="triple-bond"><line x1="0" y1="-6" x2="40" y2="-6" stroke="#ffffff" stroke-width="2.5"/><line x1="0" y1="0" x2="40" y2="0" stroke="#ffffff" stroke-width="2.5"/><line x1="0" y1="6" x2="40" y2="6" stroke="#ffffff" stroke-width="2.5"/></g>
       <polygon id="solid-wedge" points="0,-2 40,-6 40,6 0,2" fill="#ffffff"/>
       <line id="dashed-wedge" x1="0" y1="0" x2="40" y2="0" stroke="#ffffff" stroke-width="2.5" stroke-dasharray="4,4"/>
     </defs>
     \`\`\`
   - **Ring Placement**: Use \`<use href="#benzene-ring" transform="translate(200, 200) rotate(30)"/>\` to place rings. **ALWAYS use \`transform="translate(x, y) rotate(angle)"\`** so the rotation is centered on the ring! Do NOT use \`x\` and \`y\` attributes with \`rotate(angle x y)\`.
   - **Ring Connections (CRITICAL)**: Bonds connecting to a ring MUST start exactly at one of the ring's vertices (radius 40), NEVER from the center of the ring. Calculate the vertex coordinates carefully based on the ring's center and rotation!
   - For single bonds, use \`<line x1="" y1="" x2="" y2="" stroke="#ffffff" stroke-width="2.5"/>\`. Assume a standard bond length of 40 units.
   - For double/triple/wedge bonds, use \`<use href="#double-bond" transform="translate(x, y) rotate(angle)"/>\`. This will draw the bond starting at (x,y) and extending 40 units in the direction of the angle.
6. **Zig-Zag Chains & 120° Angles**: Acyclic carbon chains MUST be drawn as zig-zag lines with 120° angles. **DO NOT** draw straight horizontal or vertical lines for backbones! Example: \`<polyline points="0,0 34.6,20 69.2,0 103.8,20" fill="none" stroke="#ffffff" stroke-width="2.5"/>\`.
7. **Text Alignment & Anti-Overlap (CRITICAL)**:
   - Bonds MUST connect to the edge of the text, NEVER overlapping or crossing through the text. Leave a 15-20px gap between the bond line's end coordinate and the text coordinate.
   - **Left-side groups** (e.g., \`HO-\`): MUST use \`text-anchor="end"\`.
   - **Right-side groups** (e.g., \`-CH3\`): MUST use \`text-anchor="start"\`.
   - **Top/Bottom groups**: Use \`text-anchor="middle"\`.
   - All text MUST use \`dominant-baseline="central"\` for vertical centering.
   - **DO NOT split text and numbers**: For groups with numbers (like CH3, NH2), put them in a single \`<text>\` tag (e.g., \`<text>CH3</text>\`). DO NOT use separate \`<text>\` tags for the letters and the numbers.
   - **Polymer brackets/coefficients**: If drawing a polymer with brackets and a degree of polymerization 'n', ensure the 'n' is positioned immediately adjacent to the bottom right of the closing bracket.

# Output Structure (When analyzing a specific step)
When the user specifies a step to analyze, output according to this structure:
## 1. Reaction Overview
Use concise language and LaTeX formulas to summarize the reaction step and conditions.
## 2. Structural Visualization
Draw EACH substance (reactant, intermediate, product) in its own separate SVG image. **DO NOT put multiple substances in a single SVG.**
Use Markdown text and arrows (e.g., \`==[ reagents/conditions ]==>\` or ⬇️) between the HTML/SVG blocks to illustrate the transformation.
Example format:
\`\`\`html
<svg>...Reactant...</svg>
\`\`\`
⬇️ *Reaction conditions*
\`\`\`html
<svg>...Product...</svg>
\`\`\`
## 3. Detailed Explanation
Explain the reaction type, conditions, and structural changes in a way a high school student can easily understand.`;
  }
  return `你是一位顶级的有机化学专家，同时也是一位精通 HTML5 和 SVG 矢量绘图的前端可视化大师。你的任务是帮助高中生攻克有机大题。

# 交互规则 (严格遵守)
1. **图片上传处理**：如果用户上传了一张有机推断题的图片（如多步合成流程图），**绝对不要一股脑把整道题都解析完或画出所有结构**。你必须先简要确认你看到了什么，然后主动询问用户：“你想解析从哪到哪一步？（例如 A -> B，还是 B -> C？）”。等待用户回复后，再进行下一步。
2. **按需解析**：只针对用户指定的那一步反应进行详细解析和 SVG 绘图。

# SVG 绘图规范
1. **纯净的结构式**：只绘制分子的干净结构式。**绝对不要画断键（红色虚线）、成键（绿色虚线）或电子转移的弯箭头。** 保持排版整洁、间距合理。
2. **画布与排版**：必须使用 \`viewBox\` 属性（如 \`viewBox="0 0 600 300"\`）保证图形自适应缩放。**背景必须是深色/黑色（例如在最底层添加 \`<rect width="100%" height="100%" fill="#18181b"/>\`）**。分子骨架主色调：**纯白 \`#ffffff\`**，线宽 \`stroke-width="2.5"\`。
3. **原子标签**：杂原子 (N, O, S, 卤素等) 和基团必须用文本 \`<text fill="#ffffff">\` 标出，并且在文本下方放置一个深色的 \`<circle fill="#18181b">\` 作为背景遮罩。字体统一使用：\`font-family="Arial, sans-serif" dominant-baseline="middle" text-anchor="middle" font-weight="bold"\`。
4. **严格还原原图**：
   - **保持原图构型**：在绘制 SVG 结构式时，必须100%与用户上传原图中的分子朝向、结构布局和画法保持一致。**绝对不要随意左右颠倒、上下翻转或旋转分子结构。**
   - **禁止擅自简写**：**绝对不要**使用 "Ph"（苯基）、"Et"（乙基）等简写形式，除非原图中就是这么写的。如果原图画的是完整的苯环，你就必须画出完整的苯环。最大化保留题目原始的形状和视觉特征。
5. **SVG 坐标计算与预定义环 (极其重要)**：
   - 为了防止环画歪或坐标算错，你**必须**在每个 SVG 的最上方包含以下 \`<defs>\` 代码块：
     \`\`\`xml
     <defs>
       <g id="benzene-ring"><polygon points="0,-40 34.6,-20 34.6,20 0,40 -34.6,20 -34.6,-20" fill="none" stroke="#ffffff" stroke-width="2.5"/><circle cx="0" cy="0" r="24" fill="none" stroke="#ffffff" stroke-width="2.5"/></g>
       <polygon id="cyclohexane-ring" points="0,-40 34.6,-20 34.6,20 0,40 -34.6,20 -34.6,-20" fill="none" stroke="#ffffff" stroke-width="2.5"/>
       <polygon id="cyclopentane-ring" points="0,-40 38,-12 23.5,32 -23.5,32 -38,-12" fill="none" stroke="#ffffff" stroke-width="2.5"/>
       <g id="double-bond"><line x1="0" y1="-4" x2="40" y2="-4" stroke="#ffffff" stroke-width="2.5"/><line x1="0" y1="4" x2="40" y2="4" stroke="#ffffff" stroke-width="2.5"/></g>
       <g id="triple-bond"><line x1="0" y1="-6" x2="40" y2="-6" stroke="#ffffff" stroke-width="2.5"/><line x1="0" y1="0" x2="40" y2="0" stroke="#ffffff" stroke-width="2.5"/><line x1="0" y1="6" x2="40" y2="6" stroke="#ffffff" stroke-width="2.5"/></g>
       <polygon id="solid-wedge" points="0,-2 40,-6 40,6 0,2" fill="#ffffff"/>
       <line id="dashed-wedge" x1="0" y1="0" x2="40" y2="0" stroke="#ffffff" stroke-width="2.5" stroke-dasharray="4,4"/>
     </defs>
     \`\`\`
   - **放置环**：使用 \`<use href="#benzene-ring" transform="translate(200, 200) rotate(30)"/>\` 来放置环。**始终使用 \`transform="translate(x, y) rotate(angle)"\`** 这样旋转中心就是环的中心！绝对不要使用 \`x\` 和 \`y\` 属性配合 \`rotate(angle x y)\`。
   - **连接环 (极其重要)**：连接到环上的化学键**必须**从环的某个顶点（半径为 40）开始，**绝对不能**从环的中心开始画。请根据环的中心坐标和旋转角度，仔细计算顶点的坐标！
   - 单键使用 \`<line x1="" y1="" x2="" y2="" stroke="#ffffff" stroke-width="2.5"/>\`。标准键长设定为 40 像素。
   - 双键、三键、楔形键（实心/虚线）请直接调用 \`<use href="#double-bond" transform="translate(x, y) rotate(angle)"/>\`。这会从 (x,y) 开始，沿着 angle 方向画出长度为 40 的键。
6. **锯齿状碳链 (Zig-zag)**：链状结构**必须**画成 120° 夹角的锯齿状（折线），**绝对禁止**画成一条笔直的水平线或垂直线！例如：\`<polyline points="0,0 34.6,20 69.2,0 103.8,20" fill="none" stroke="#ffffff" stroke-width="2.5"/>\`。
7. **精准对齐与防重叠 (极其重要)**：
   - 化学键的端点必须刚好连接到字母的边缘，**绝对不能穿透或重叠到文字上**。化学键的端点坐标与文字坐标之间必须留出 15-20 像素的空白间距。
   - **左侧基团**（如 \`HO-\`）：必须使用 \`text-anchor="end"\`，让基团靠右对齐连接键。
   - **右侧基团**（如 \`-CH3\`）：必须使用 \`text-anchor="start"\`，让基团靠左对齐连接键。
   - **上下基团**：使用 \`text-anchor="middle"\`。
   - 所有文字必须使用 \`dominant-baseline="central"\` 保证垂直居中。
   - **绝对不要拆分字母和数字**：对于带有数字的基团（如 CH3, NH2），请将字母和数字写在同一个 \`<text>\` 标签中，例如 \`<text>CH3</text>\`。绝对不要将数字单独拆分成另一个 \`<text>\` 标签。
   - **聚合度/系数**：如果是聚合物的括号和聚合度 n，请确保 n 的坐标紧挨着右侧括号的右下角。

# 输出结构 (当解析具体某一步时)
当用户明确了要解析哪一步后，请按照以下结构输出：
## 1. 反应总览
用简洁的语言和 LaTeX 公式概括该步反应的类型和条件。
## 2. 结构式可视化
**一个物质一张图**：将反应物、中间体、产物分别绘制在**独立**的 SVG 中。**绝对不要把两个或多个物质挤在同一个 SVG 画布里。**
**图文结合展示转化**：在不同的 HTML/SVG 代码块之间，使用 Markdown 文本和箭头（例如 \`==[ 反应试剂/条件 ]==>\` 或 ⬇️）来连接和说明它们是如何转化的。
输出示例格式：
\`\`\`html
<svg>...反应物...</svg>
\`\`\`
⬇️ *反应条件/试剂*
\`\`\`html
<svg>...产物...</svg>
\`\`\`
## 3. 详细解析
用高中生能听懂的语言，详细解释反应类型、条件作用以及结构变化。`;
};

// Custom Markdown components to render SVG directly
const MarkdownComponents = (lang: 'zh' | 'en', onRegenerateSvg?: (svgCode: string) => void) => ({
  code({ node, inline, className, children, ...props }: any) {
    const match = /language-(\w+)/.exec(className || '');
    const codeString = String(children).replace(/\n$/, '');
    const [copied, setCopied] = React.useState(false);
    const t = TRANSLATIONS[lang];
    
    // Render SVG if it's an HTML/XML block containing <svg>
    if (!inline && match && (match[1] === 'html' || match[1] === 'xml') && codeString.includes('<svg')) {
      const handleCopy = () => {
        navigator.clipboard.writeText(codeString);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      };

      return (
        <div className="my-4 bg-zinc-900 rounded-xl overflow-hidden shadow-sm border border-zinc-800 flex flex-col items-center p-4 relative group">
          <button
            onClick={handleCopy}
            className="absolute top-2 right-2 p-2 bg-zinc-800/80 hover:bg-zinc-700 text-zinc-400 hover:text-white rounded-lg opacity-0 group-hover:opacity-100 transition-all flex items-center gap-1.5 text-[10px] font-medium z-10"
            title={t.organicModeCopySvg}
          >
            {copied ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
            {copied ? t.copied : t.organicModeCopySvg}
          </button>
          <div 
            className="w-full flex justify-center"
            dangerouslySetInnerHTML={{ __html: codeString }} 
          />
          {onRegenerateSvg && (
            <button
              onClick={() => onRegenerateSvg(codeString)}
              className="absolute bottom-2 right-2 p-2 bg-zinc-800/80 hover:bg-zinc-700 text-zinc-400 hover:text-white rounded-lg opacity-0 group-hover:opacity-100 transition-all flex items-center gap-1.5 text-[10px] font-medium z-10"
              title={lang === 'zh' ? '重新生成此结构式' : 'Regenerate this structure'}
            >
              <RefreshCw className="w-3 h-3" />
              {lang === 'zh' ? '重新生成' : 'Regenerate'}
            </button>
          )}
        </div>
      );
    }
    
    return !inline ? (
      <div className="relative group">
        <pre className="bg-zinc-900 text-zinc-100 p-4 rounded-xl overflow-x-auto text-sm my-4 border border-zinc-800">
          <code className={className} {...props}>
            {children}
          </code>
        </pre>
      </div>
    ) : (
      <code className="bg-zinc-800 text-zinc-200 px-1.5 py-0.5 rounded text-sm font-mono" {...props}>
        {children}
      </code>
    );
  }
});

export function OrganicChemistryMode({ lang, model, onSaveHistory, initialData }: { lang: 'zh' | 'en', model: string, onSaveHistory: (mode: string, summary: string, data: any) => void, initialData?: any }) {
  const t = TRANSLATIONS[lang];
  const [messages, setMessages] = useState<{role: 'user'|'model', text: string, image?: string}[]>(initialData?.messages || []);
  
  useEffect(() => {
    if (initialData?.messages) {
      setMessages(initialData.messages);
    }
  }, [initialData]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [activeModel, setActiveModel] = useState(model || 'gemini-3.1-pro-preview');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const quickActions = [
    { id: 'ab', text: t.organicModeQuickAction1 },
    { id: 'isomers', text: t.organicModeQuickAction2 },
    { id: 'conditions', text: t.organicModeQuickAction3 },
  ];

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      setSelectedImage(reader.result as string);
    };
    reader.readAsDataURL(file);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleRegenerateSvg = (svgCode: string) => {
    const prompt = lang === 'zh' 
      ? `请重新生成下面这个SVG结构式，它在渲染时出现了一些问题（例如文字错位、化学键连接不正确等）。请修正这些问题并重新输出SVG代码：\n\`\`\`xml\n${svgCode}\n\`\`\``
      : `Please regenerate the following SVG structure. There were some issues with its rendering (e.g., misaligned text, incorrect bonds). Please fix these issues and output the corrected SVG code:\n\`\`\`xml\n${svgCode}\n\`\`\``;
    
    handleSend(prompt);
  };

  const handleSend = async (overrideText?: string) => {
    const textToSend = overrideText || input.trim();
    if ((!textToSend && !selectedImage) || isTyping) return;
    
    const userText = textToSend;
    const userImage = selectedImage;
    
    setInput('');
    setSelectedImage(null);
    const newUserMsg = { role: 'user' as const, text: userText, image: userImage || undefined };
    setMessages(prev => [...prev, newUserMsg]);
    setIsTyping(true);

    try {
      const historyContents = messages.map(m => {
        const parts: any[] = [{ text: m.text }];
        if (m.image) {
          const base64Data = m.image.split(',')[1];
          const mimeType = m.image.split(';')[0].split(':')[1];
          parts.unshift({
            inlineData: { data: base64Data, mimeType }
          });
        }
        return { role: m.role, parts };
      });
      
      const currentParts: any[] = [{ text: userText || '请解析这张图片中的有机化学问题。' }];
      if (userImage) {
        const base64Data = userImage.split(',')[1];
        const mimeType = userImage.split(';')[0].split(':')[1];
        currentParts.unshift({
          inlineData: { data: base64Data, mimeType }
        });
      }

      const response = await ai.models.generateContent({
        model: activeModel,
        contents: [...historyContents, { role: 'user', parts: currentParts }],
        config: {
          systemInstruction: getSystemInstruction(lang),
          temperature: 0.2, // Lower temperature for more accurate chemistry
        }
      });

      if (response.text) {
        setMessages(prev => {
          const newMessages = [...prev, { role: 'model' as const, text: response.text! }];
          let summary = lang === 'en' ? 'Organic Chemistry' : '有机化学';
          const firstUserMsg = newMessages.find((m: any) => m.role === 'user');
          if (firstUserMsg && firstUserMsg.text) {
            summary = firstUserMsg.text.substring(0, 30) + (firstUserMsg.text.length > 30 ? '...' : '');
          }
          const historyMessages = newMessages.map(m => ({ ...m, image: undefined }));
          onSaveHistory('organic-chemistry', summary, { messages: historyMessages });
          return newMessages;
        });
      }
    } catch (error) {
      console.error("Chat Error:", error);
      setMessages(prev => {
        const newMessages = [...prev, { role: 'model' as const, text: lang === 'en' ? "An error occurred while analyzing the problem. Please try again." : "解析问题时发生错误，请重试。" }];
        let summary = lang === 'en' ? 'Organic Chemistry' : '有机化学';
        const firstUserMsg = newMessages.find((m: any) => m.role === 'user');
        if (firstUserMsg && firstUserMsg.text) {
          summary = firstUserMsg.text.substring(0, 30) + (firstUserMsg.text.length > 30 ? '...' : '');
        }
        const historyMessages = newMessages.map(m => ({ ...m, image: undefined }));
        onSaveHistory('organic-chemistry', summary, { messages: historyMessages });
        return newMessages;
      });
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-zinc-950 text-white overflow-hidden relative">
      <div className="flex-1 overflow-y-auto p-6 pt-10 max-w-4xl mx-auto w-full flex flex-col">
        <div className="mb-8 text-center flex flex-col items-center relative">
          <div className="flex items-center gap-3 mb-2">
            <h2 className="text-3xl font-bold text-white flex items-center gap-2">
              <Beaker className="w-8 h-8 text-white" />
              {t.organicModeTitle}
            </h2>
            <button 
              onClick={() => setShowHelp(!showHelp)}
              className="p-1.5 text-zinc-500 hover:text-white transition-colors"
            >
              <HelpCircle className="w-5 h-5" />
            </button>
          </div>
          <p className="text-white/60 mb-4 italic">{t.organicModeSubtitle}</p>

          <AnimatePresence>
            {showHelp && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="w-full max-w-md bg-white/5 border border-white/10 rounded-2xl p-4 mb-6 text-left overflow-hidden"
              >
                <h3 className="text-sm font-bold text-white mb-2 flex items-center gap-2">
                  <HelpCircle className="w-4 h-4" />
                  {t.organicModeInstructions}
                </h3>
                <ul className="text-xs text-zinc-400 space-y-2 list-disc list-inside">
                  <li>{t.organicModeInstruction1}</li>
                  <li>{t.organicModeInstruction2}</li>
                  <li>{t.organicModeInstruction3}</li>
                  <li>{t.organicModeInstruction4}</li>
                </ul>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="flex-1 overflow-y-auto mb-6 space-y-6 custom-scrollbar pr-2">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-white/30 gap-8">
              <div className="flex flex-col items-center gap-4">
                <Beaker className="w-12 h-12 text-white/50" />
                <p className="text-center max-w-md">{t.organicModeEmpty}</p>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full max-w-3xl mt-4">
                {[
                  {
                    id: 'gemini-3.1-pro-preview',
                    title: lang === 'zh' ? 'Pro 深度解析' : 'Pro Deep Analysis',
                    desc: lang === 'zh' ? '复杂推断，深度机理' : 'Complex deduction, deep mechanism'
                  },
                  {
                    id: 'gemini-3-flash-preview',
                    title: lang === 'zh' ? 'Flash 快速解答' : 'Flash Quick Answer',
                    desc: lang === 'zh' ? '反应迅速，全能助手' : 'Fast response, versatile'
                  },
                  {
                    id: 'gemini-3.1-flash-lite-preview',
                    title: lang === 'zh' ? 'Flash-Lite 极速版' : 'Flash-Lite Speed',
                    desc: lang === 'zh' ? '简单问题，极速响应' : 'Simple questions, fast'
                  }
                ].map(m => (
                  <button
                    key={m.id}
                    onClick={() => setActiveModel(m.id)}
                    className={`p-4 rounded-2xl border text-left transition-all ${
                      activeModel === m.id 
                        ? 'bg-white/10 border-white/30 text-white' 
                        : 'bg-white/5 border-white/5 text-zinc-500 hover:bg-white/10 hover:text-zinc-300'
                    }`}
                  >
                    <h3 className="font-bold text-sm mb-1 text-white">{m.title}</h3>
                    <div className="text-[10px] font-mono opacity-50 mb-2">{m.id}</div>
                    <p className="text-xs">{m.desc}</p>
                  </button>
                ))}
              </div>
            </div>
          )}
          
          {messages.map((msg, idx) => (
            <motion.div 
              key={idx}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div className={`max-w-[90%] ${msg.role === 'user' ? 'bg-white text-black' : 'bg-zinc-900 border border-zinc-800 text-zinc-200'} rounded-2xl p-4 shadow-sm`}>
                {msg.image && (
                  <img src={msg.image} alt="Uploaded problem" className="max-w-xs rounded-lg mb-3 border border-white/20" />
                )}
                {msg.role === 'model' ? (
                  <div className="markdown-body prose prose-invert max-w-none prose-pre:bg-zinc-950 prose-pre:border prose-pre:border-zinc-800">
                    <ReactMarkdown 
                      remarkPlugins={[remarkGfm, remarkMath, remarkBreaks]} 
                      rehypePlugins={[rehypeRaw, rehypeKatex]}
                      components={MarkdownComponents(lang, handleRegenerateSvg)}
                    >
                      {msg.text}
                    </ReactMarkdown>
                  </div>
                ) : (
                  <p className="whitespace-pre-wrap">{msg.text}</p>
                )}
              </div>
            </motion.div>
          ))}
          
          {isTyping && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex justify-start"
            >
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-white" />
                <span className="text-sm text-zinc-400">正在解析机理...</span>
              </div>
            </motion.div>
          )}
          <div ref={chatEndRef} />
        </div>

        <div className="relative max-w-3xl mx-auto w-full">
          <div className="flex flex-wrap gap-2 mb-4">
            {quickActions.map(action => (
              <button
                key={action.id}
                onClick={() => handleSend(action.text)}
                disabled={isTyping}
                className="px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-full text-xs text-zinc-300 hover:text-white transition-all"
              >
                {action.text}
              </button>
            ))}
          </div>

          <AnimatePresence>
            {selectedImage && (
              <motion.div 
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.95 }}
                className="absolute bottom-full mb-2 left-0 bg-zinc-800 p-2 rounded-xl border border-zinc-700 shadow-lg"
              >
                <div className="relative group">
                  <img src={selectedImage} alt="Selected" className="h-24 rounded-lg object-contain bg-zinc-900" />
                  <button 
                    onClick={() => setSelectedImage(null)}
                    className="absolute -top-2 -right-2 p-1 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="flex items-end gap-2 bg-zinc-900 border border-zinc-800 rounded-3xl p-2 shadow-sm focus-within:border-white/50 focus-within:ring-1 focus-within:ring-white/50 transition-all">
            <input
              type="file"
              accept="image/*"
              className="hidden"
              ref={fileInputRef}
              onChange={handleImageUpload}
            />
            <button 
              onClick={() => fileInputRef.current?.click()}
              className="p-3 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-full transition-colors shrink-0"
              title="上传题目图片"
            >
              <ImageIcon className="w-5 h-5" />
            </button>
            
            <textarea 
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder={t.organicModePlaceholder}
              className="flex-1 bg-transparent border-none text-white text-sm focus:ring-0 outline-none resize-none py-3 px-2 max-h-32 custom-scrollbar"
              rows={1}
              style={{ minHeight: '44px' }}
            />
            
            <button 
              onClick={() => handleSend()}
              disabled={(!input.trim() && !selectedImage) || isTyping}
              className="p-3 bg-white hover:bg-zinc-200 disabled:bg-zinc-800 disabled:text-zinc-600 text-black rounded-full transition-colors shrink-0"
            >
              <Send className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
