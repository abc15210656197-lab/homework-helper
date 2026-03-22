import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, FileText, Headphones, Mic, BookOpen, PenTool, LineChart, Palette } from 'lucide-react';

interface UserGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
  lang: 'zh' | 'en';
}

export function UserGuideModal({ isOpen, onClose, lang }: UserGuideModalProps) {
  if (!isOpen) return null;

  const guides = [
    {
      icon: <FileText className="w-5 h-5 text-blue-400" />,
      title: lang === 'zh' ? '题目提取' : 'Question Extractor',
      details: lang === 'zh' ? [
        '上传题目：支持拖拽、点击上传、粘贴图片或使用摄像头拍照。支持同时上传多张图片。',
        '智能解析：AI 将自动识别图片中的题目，并分点给出“题目摘要”、“详细解答”、“深度解析”和“注意事项”。',
        '多题切换：上传多图时，可通过左侧列表快速切换不同题目的解析结果。',
        '复制与保存：支持一键复制解析文本，所有记录会自动保存在历史记录中。'
      ] : [
        'Upload: Support drag & drop, click, paste, or camera. Multiple images supported.',
        'Smart Analysis: AI extracts the question and provides Summary, Answer, Explanation, and Precautions.',
        'Navigation: Switch between multiple questions using the left sidebar.',
        'Copy & Save: One-click copy, automatically saved to history.'
      ]
    },
    {
      icon: <Headphones className="w-5 h-5 text-indigo-400" />,
      title: lang === 'zh' ? '语音讲题' : 'Audio Tutor',
      details: lang === 'zh' ? [
        '上传题目：上传单张题目图片。',
        '语音讲解：AI 将模拟真实教师的口吻，生成生动、口语化的语音讲解音频，并配有文字版讲稿。',
        '实时语音答疑：点击“开始通话”按钮，您可以直接通过麦克风与 AI 老师进行实时语音对话，针对不懂的地方进行追问。'
      ] : [
        'Upload: Upload a single question image.',
        'Audio Explanation: AI generates a vivid, conversational audio explanation like a real teacher, along with a text transcript.',
        'Live Voice Q&A: Click "Start Call" to talk directly with the AI tutor via microphone for follow-up questions.'
      ]
    },
    {
      icon: <LineChart className="w-5 h-5 text-cyan-400" />,
      title: lang === 'zh' ? '函数绘图仪' : 'Graphing Calculator',
      details: lang === 'zh' ? [
        '拍照识别：上传包含数学公式的图片，AI 会自动提取公式并在右侧坐标系中绘制图像。',
        '交互式图表：支持鼠标滚轮缩放、拖拽平移，鼠标悬浮可查看具体坐标点。',
        '专属数学键盘：点击左侧的输入框，可使用内置的专业数学键盘手动输入或修改函数公式。',
        '动态参数：支持识别并动态调整公式中的参数（如 a, b, c）。',
        '模型选择：可根据公式复杂度选择不同的提取模型（如 Gemini 3.1 Pro 适用于复杂公式）。'
      ] : [
        'Image Recognition: Upload an image with math formulas, AI extracts and plots them.',
        'Interactive Graph: Support zoom, pan, and hover for coordinates.',
        'Math Keyboard: Use the built-in math keyboard to manually enter or edit functions.',
        'Dynamic Parameters: Adjust parameters dynamically (e.g., a, b, c).',
        'Model Selection: Choose different models based on formula complexity.'
      ]
    },
    {
      icon: <Mic className="w-5 h-5 text-purple-400" />,
      title: lang === 'zh' ? '朗读纠错' : 'Reading Coach',
      details: lang === 'zh' ? [
        '选择素材：从内置列表中选择英语短文，或点击“+”让 AI 随机生成新素材。',
        '录音朗读：点击麦克风图标开始朗读屏幕上的英文文本，完成后点击停止。',
        '智能评估：AI 将从发音、流利度、语调等方面进行打分（满分8分），并高亮标出“读错”和“发音不准”的单词。',
        '标准示范：提供标准发音的音频供您跟读对比。'
      ] : [
        'Select Material: Choose from built-in English texts or let AI generate new ones.',
        'Record: Click the mic to start reading the text, click stop when done.',
        'Smart Evaluation: AI scores your pronunciation, fluency, and intonation (out of 8), highlighting mispronounced and inaccurate words.',
        'Standard Audio: Listen to the standard pronunciation for comparison.'
      ]
    },
    {
      icon: <BookOpen className="w-5 h-5 text-amber-400" />,
      title: lang === 'zh' ? '语文素材' : 'Material Assistant',
      details: lang === 'zh' ? [
        '管理素材书：点击“素材书管理”上传您的 PDF 格式语文素材或阅读材料。',
        '输入作文题：上传作文题目图片或直接输入题目文字。',
        '提取素材：勾选需要参考的素材书，AI 将自动从中检索、提取与题目高度相关的名言、事例，并给出应用建议。',
        '深度对话：在右侧聊天窗口中，您可以针对提取的素材与 AI 进一步探讨写作思路。'
      ] : [
        'Manage Books: Click "Textbook Manager" to upload PDF reading materials.',
        'Input Topic: Upload an essay prompt image or type it.',
        'Extract Materials: Select reference books, and AI will extract highly relevant quotes/examples with application suggestions.',
        'Deep Chat: Discuss writing ideas with AI in the right-side chat window.'
      ]
    },
    {
      icon: <PenTool className="w-5 h-5 text-rose-400" />,
      title: lang === 'zh' ? '作文讲评' : 'Essay Feedback',
      details: lang === 'zh' ? [
        '导入作文：支持上传作文图片（AI自动识别文字）或直接输入/粘贴文本。可选择性上传“题目要求”图片作为批改参考。',
        '全局与细节批改：AI 提供包含总评、评分的宏观反馈，并在正文中高亮语法、用词等微观错误。',
        '画布模式：点击高亮的错误，弹出详细修改建议，可一键“采纳”或“忽略”。',
        '段落级精修：点击任意自然段，右侧出现“箭头”图标，点击唤出段落编辑器。您可以选择特定的 AI 模型，输入具体指令，让 AI 专门重写该段落。',
        '全局对话：右侧面板支持针对整篇作文与 AI 进行多轮对话探讨。'
      ] : [
        'Import Essay: Upload essay images or type text. Optionally upload prompt requirements.',
        'Global & Detail Feedback: AI provides macro feedback (score, summary) and highlights micro errors (grammar, vocabulary).',
        'Canvas Mode: Click highlighted errors to see suggestions, accept or reject them.',
        'Paragraph Editing: Click a paragraph to show the arrow icon, click it to open the inline editor. Select an AI model and give specific instructions to rewrite that paragraph.',
        'Global Chat: Discuss the entire essay with AI in the right panel.'
      ]
    },
    {
      icon: <Palette className="w-5 h-5 text-indigo-400" />,
      title: lang === 'zh' ? '全局功能' : 'Global Features',
      details: lang === 'zh' ? [
        '清空进度：点击顶部“清空”按钮，可重置当前打开功能的进度至初始状态。',
        '主题切换：点击顶部“主题”按钮，可在“无 (纯黑)”、“流动线条”和“空灵气泡”三种背景间自由切换。'
      ] : [
        'Clear Progress: Click the "Clear" button at the top to reset the current feature to its initial state.',
        'Theme Switcher: Click the "Theme" button at the top to switch between "None (Black)", "Flowing Lines", and "Ethereal Bubbles" backgrounds.'
      ]
    }
  ];

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          onClick={onClose}
        />
        <motion.div 
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="relative w-full max-w-4xl bg-[#1A1A1A] border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
        >
          <div className="flex items-center justify-between p-6 border-b border-white/10 bg-white/5 shrink-0">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <BookOpen className="w-6 h-6 text-indigo-400" />
              {lang === 'zh' ? '使用指引' : 'User Guide'}
            </h2>
            <button 
              onClick={onClose}
              className="p-2 hover:bg-white/10 rounded-full transition-colors text-zinc-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          
          <div className="p-6 overflow-y-auto custom-scrollbar flex-1">
            <div className="grid grid-cols-1 gap-4">
              {guides.map((guide, idx) => (
                <div key={idx} className="bg-white/5 border border-white/10 rounded-xl p-5 hover:bg-white/10 transition-colors">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 bg-white/10 rounded-lg">
                      {guide.icon}
                    </div>
                    <h3 className="text-lg font-bold text-white">{guide.title}</h3>
                  </div>
                  <ul className="space-y-2">
                    {guide.details.map((detail, dIdx) => (
                      <li key={dIdx} className="text-zinc-400 text-sm leading-relaxed flex items-start gap-2">
                        <span className="text-white/20 mt-0.5">•</span>
                        <span>{detail}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
