import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenAI } from '@google/genai';
import { Send, Loader2, Image as ImageIcon, X, HelpCircle, Beaker, Copy, Check, RefreshCw, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
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

const CHEMISTRY_KNOWLEDGE = {
  zh: [
    {
      title: "物质分类与俗名",
      content: "**元素形态**：游离态（单质）、化合态（化合物）。\n**同素异形体**：由同种元素形成的不同单质，如 $\\text{O}_2$ 和 $\\text{O}_3$。转化属化学变化。\n**氧化物**：过氧化物（如 $\\text{Na}_2\\text{O}_2$）不是氧化物。\n**俗名**：水玻璃 ($\\text{Na}_2\\text{SiO}_3$ aq)、碱石灰 ($\\text{NaOH}+\\text{CaO}$)、漂白粉 ($\\text{Ca(ClO)}_2$ 有效成分)。"
    },
    {
      title: "物理与化学变化",
      content: "**化学变化**：煤的干馏、石油裂化/裂解、风化、钝化、炭化、淀粉糊化。\n**物理变化**：石油分馏、$\\text{I}_2$ 升华、$\\text{NaCl}$ 溶于水、潮解、活性炭吸附。"
    },
    {
      title: "分散系（胶体）",
      content: "**性质**：胶体可通过滤纸，不能通过半透膜。胶体不带电，胶粒带电。\n**聚沉**：加电解质、加相反电荷胶粒、加热、搅拌。\n**应用**：明矾净水 ($\\text{Al(OH)}_3$ 胶体)。"
    },
    {
      title: "卤素与氯 (Cl)",
      content: "**氧化性**：$\\text{MnO}_4^- > \\text{Cl}_2 > \\text{Br}_2 > \\text{Fe}^{3+} > \\text{I}_2 > \\text{SO}_4^{2-} > \\text{SO}_2 > \\text{S}$。\n**氯气制备**：$\\text{MnO}_2 + 4\\text{HCl}(浓) \\triangleq \\text{MnCl}_2 + \\text{Cl}_2 \\uparrow + 2\\text{H}_2\\text{O}$。饱和食盐水除 $\\text{HCl}$。\n**84消毒液**：$\\text{Cl}_2 + 2\\text{NaOH} = \\text{NaCl} + \\text{NaClO} + \\text{H}_2\\text{O}$。"
    },
    {
      title: "硫 (S) 与氮 (N)",
      content: "**浓硫酸**：$\\text{Cu} + 2\\text{H}_2\\text{SO}_4(浓) \\triangleq \\text{CuSO}_4 + \\text{SO}_2 \\uparrow + 2\\text{H}_2\\text{O}$。\n**$\\text{SO}_2$ 鉴别**：品红褪色（加热复原），$\\text{KMnO}_4$ 褪色。\n**固氮**：人工 ($\\text{N}_2+3\\text{H}_2 \\rightleftharpoons 2\\text{NH}_3$)、自然 ($\\text{N}_2+\\text{O}_2 \\xrightarrow{放电} 2\\text{NO}$)。\n**氨气**：$\\text{Ca(OH)}_2 + 2\\text{NH}_4\\text{Cl} \\triangleq 2\\text{NH}_3 \\uparrow + 2\\text{H}_2\\text{O} + \\text{CaCl}_2$。"
    },
    {
      title: "钠 (Na) 与铁 (Fe)",
      content: "**钠**：与 $\\text{CuSO}_4$ 反应先生成 $\\text{NaOH}$ 和 $\\text{H}_2$，再生成 $\\text{Cu(OH)}_2$ 沉淀。\n**侯氏制碱**：$\\text{NaCl} + \\text{NH}_3 + \\text{H}_2\\text{O} + \\text{CO}_2 = \\text{NaHCO}_3 \\downarrow + \\text{NH}_4\\text{Cl}$。\n**铁三角**：$\\text{Fe} \\leftrightarrow \\text{Fe}^{2+} \\leftrightarrow \\text{Fe}^{3+}$。$\\text{Fe}^{3+}$ 遇 $\\text{KSCN}$ 显血红色。"
    },
    {
      title: "铜 (Cu) 与铝 (Al)",
      content: "**铜绿**：$2\\text{Cu} + \\text{O}_2 + \\text{H}_2\\text{O} + \\text{CO}_2 = \\text{Cu}_2\\text{(OH)}_2\\text{CO}_3$。\n**铝热反应**：$\\text{Fe}_2\\text{O}_3 + 2\\text{Al} \\xrightarrow{高温} 2\\text{Fe} + \\text{Al}_2\\text{O}_3$。\n**铝两性**：$\\text{Al}$ 与 $\\text{NaOH}$ 反应生成 $\\text{NaAlO}_2 + \\text{H}_2$。$\\text{Al}^{3+}$ 易发生双水解。"
    },
    {
      title: "离子反应与氧化还原",
      content: "**共存禁忌**：$\\text{Al}^{3+}$ 不与 $\\text{OH}^-, \\text{CO}_3^{2-}, \\text{HCO}_3^-$ 共存；$\\text{Fe}^{3+}$ 不与 $\\text{SCN}^-, \\text{I}^-$ 共存。\n**氧化还原**：歧化（中 $\to$ 高+低）、归中（高+低 $\to$ 中）。氧化剂氧化性 $>$ 氧化产物。"
    },
    {
      title: "热化学与反应平衡",
      content: "**盖斯定律**：$\\Delta H$ 只与始态、终态有关。燃烧热：1mol 纯物质完全燃烧生成稳定氧化物。\n**平衡常数 $K$**：只受温度影响。$Q < K$ 正向移动。\n**勒夏特列原理**：减弱改变。自发性：$\\Delta G = \\Delta H - T\\Delta S < 0$。"
    },
    {
      title: "水溶液中的离子平衡",
      content: "**水的电离**：升温 $K_w$ 变大，pH 变小。盐类水解：越弱越水解，谁强显谁性。\n**守恒**：电荷守恒、物料守恒、质子守恒。\n**沉淀溶解平衡**：$K_{sp}$ 大的易转化为 $K_{sp}$ 小的。"
    },
    {
      title: "电化学原理",
      content: "**原电池**：化学能 $\to$ 电能。负极失电子（氧化），正极得电子（还原）。\n**电解池**：电能 $\to$ 化学能。阳极失电子，阴极得电子。\n**氯碱工业**：阳极 $\\text{Cl}^-$ 失电子，阴极 $\\text{H}_2\\text{O}$ 得电子生成 $\\text{H}_2$ 和 $\\text{OH}^-$。"
    },
    {
      title: "物质结构与晶体",
      content: "**原子半径**：层多径大；同周期核大径小。\n**杂化**：$\\text{CH}_4$ ($sp^3$ 正四面体)、$\\text{NH}_3$ ($sp^3$ 三角锥)、$\\text{H}_2\\text{O}$ ($sp^3$ V形)、$\\text{CO}_2$ ($sp$ 直线)。\n**晶体**：原子晶体 > 离子晶体 > 分子晶体（熔沸点）。"
    },
    {
      title: "有机化学基础",
      content: "**卤代烃**：水解生成醇；醇溶液加热消去生成烯烃。\n**醛**：银镜反应、加成反应。羧酸：酸性 $R\\text{-COOH} > \\text{H}_2\\text{CO}_3 > \\text{C}_6\\text{H}_5\\text{OH}$。\n**酯化反应**：酸脱羟基醇脱氢，浓硫酸催化加热。"
    },
    {
      title: "化学实验基础",
      content: "**分离**：分液（下放上倒）、结晶（蒸发/降温）。\n**离子检验**：$\\text{Na}$ (黄)、$\\text{K}$ (紫)、$\\text{Fe}^{3+}$ (SCN红)、$\\text{Cl}^-$ ($\\text{AgNO}_3$白沉)。\n**细节**：容量瓶检漏、滴定管酸碱区分、$\\text{HF}$ 存塑料瓶。"
    },
    {
      title: "烃类性质总结",
      content: "**烷烃**：取代反应（光照）。\n**烯烃/炔烃**：加成反应 ($Br_2, H_2$)、氧化反应 ($KMnO_4$ 褪色)。\n**苯**：易取代（溴苯、硝基苯）、难加成。"
    },
    {
      title: "醇酚醚重要考点",
      content: "**乙醇**：催化氧化生成乙醛 ($2\\text{CH}_3\\text{CH}_2\\text{OH} + \\text{O}_2 \\xrightarrow{Cu} 2\\text{CH}_3\\text{CHO} + 2\\text{H}_2\\text{O}$)。\n**苯酚**：弱酸性，遇 $\\text{FeCl}_3$ 显紫色，与浓溴水生成白色沉淀。"
    },
    {
      title: "醛酮羧酸转化",
      content: "**乙醛**：与新制 $\\text{Cu(OH)}_2$ 反应生成砖红色沉淀 ($\\text{Cu}_2\\text{O}$)。\n**羧酸**：具有酸性，能发生酯化反应。"
    },
    {
      title: "糖类与蛋白质",
      content: "**葡萄糖**：多羟基醛，具有还原性。\n**蛋白质**：盐析（物理）、变性（化学）、颜色反应（浓硝酸变黄）、灼烧有烧焦羽毛味。"
    },
    {
      title: "有机合成策略",
      content: "**增长碳链**：加聚反应、缩聚反应、与 $\\text{HCN}$ 加成。\n**官能团引入**：卤化、水解、氧化、还原、酯化。"
    }
  ],
  en: [
    { title: "Matter Classification", content: "Elemental forms: free state (simple substance), combined state (compound).\nAllotropes: Different simple substances formed by the same element, e.g., $\\text{O}_2$ and $\\text{O}_3$." },
    { title: "Physical & Chemical Changes", content: "Chemical: Coal distillation, petroleum cracking, weathering, passivation, carbonization.\nPhysical: Petroleum fractionation, $\\text{I}_2$ sublimation, $\\text{NaCl}$ dissolution." },
    { title: "Dispersed Systems (Colloids)", content: "Properties: Colloids pass through filter paper but not semi-permeable membranes. Particles are charged.\nCoagulation: Adding electrolytes, heating, or stirring." },
    { title: "Halogens & Chlorine", content: "Oxidizing power: $\\text{MnO}_4^- > \\text{Cl}_2 > \\text{Br}_2 > \\text{Fe}^{3+} > \\text{I}_2 > \\text{SO}_4^{2-} > \\text{SO}_2 > \\text{S}$.\nChlorine prep: $\\text{MnO}_2 + 4\\text{HCl}(conc) \\triangleq \\text{MnCl}_2 + \\text{Cl}_2 \\uparrow + 2\\text{H}_2\\text{O}$." },
    { title: "Sulfur & Nitrogen", content: "Conc. $\\text{H}_2\\text{SO}_4$: $\\text{Cu} + 2\\text{H}_2\\text{SO}_4 \\triangleq \\text{CuSO}_4 + \\text{SO}_2 \\uparrow + 2\\text{H}_2\\text{O}$.\nNitrogen fixation: Artificial ($\\text{N}_2+3\\text{H}_2 \\rightleftharpoons 2\\text{NH}_3$), Natural ($\\text{N}_2+\\text{O}_2 \\xrightarrow{discharge} 2\\text{NO}$)." },
    { title: "Sodium & Iron", content: "Sodium: Reacts with water first, then precipitates $\\text{Cu(OH)}_2$ in $\\text{CuSO}_4$ solution.\nIron triangle: $\\text{Fe} \\leftrightarrow \\text{Fe}^{2+} \\leftrightarrow \\text{Fe}^{3+}$. $\\text{Fe}^{3+}$ turns blood red with $\\text{KSCN}$." },
    { title: "Copper & Aluminum", content: "Thermite reaction: $\\text{Fe}_2\\text{O}_3 + 2\\text{Al} \\xrightarrow{high T} 2\\text{Fe} + \\text{Al}_2\\text{O}_3$.\nAluminum amphoterism: Reacts with both acids and bases to produce $\\text{H}_2$." },
    { title: "Ionic Reactions", content: "Coexistence: $\\text{Al}^{3+}$ cannot coexist with $\\text{OH}^-, \\text{CO}_3^{2-}, \\text{HCO}_3^-$.\nRedox: Oxidizing agent power $>$ Oxidized product power." },
    { title: "Thermochemistry", content: "Hess's Law: $\\Delta H$ depends only on initial and final states.\nSpontaneity: $\\Delta G = \\Delta H - T\\Delta S < 0$." },
    { title: "Ionic Equilibrium", content: "Water ionization: $K_w$ increases with temperature.\nSalt hydrolysis: 'The weaker the acid/base, the more the salt hydrolyzes'." },
    { title: "Electrochemistry", content: "Galvanic cell: Chemical $\\to$ Electrical. Anode: Oxidation, Cathode: Reduction.\nElectrolytic cell: Electrical $\\to$ Chemical." },
    { title: "Structure & Crystals", content: "Hybridization: $\\text{CH}_4$ ($sp^3$), $\\text{NH}_3$ ($sp^3$), $\\text{H}_2\\text{O}$ ($sp^3$), $\\text{CO}_2$ ($sp$).\nCrystal melting points: Covalent > Ionic > Molecular." },
    { title: "Organic Chemistry", content: "Aldehydes: Silver mirror reaction. Carboxylic acids: Acidity $R\\text{-COOH} > \\text{H}_2\\text{CO}_3 > \\text{PhOH}$.\nEsterification: Acid loses -OH, alcohol loses -H." },
    { title: "Chemical Experiments", content: "Separation: Funneling, crystallization.\nIon testing: $\\text{Na}$ (yellow), $\\text{K}$ (purple), $\\text{Fe}^{3+}$ (red with SCN)." }
  ]
};

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

const CLASS_MEMBERS = [
  "包涵", "陈明见", "崔天浩", "段柯言", "房奥洋", "冯子夏", "高嘉怡", "郭晗阳", "顾雨晴", 
  "郝天一", "和诗涵", "黄采薇", "贾灵坤", "姜亦铭", "姜雨彤", "金孟源", "李嘉桐", "刘玟言", 
  "刘雅菲", "刘梓涵", "牛思程", "唐子渔", "王若熹", "温凯翔", "闻钰翔", "吴琬琳", "薛云朗", 
  "徐望童", "叶瑾宸", "尤子谦", "查俊祺", "张景洋", "张祎辰", "赵思源", "邹韫瞳"
];

const Danmaku = () => {
  const [items, setItems] = useState<{ id: number; name: string; top: number; duration: number; delay: number }[]>([]);

  useEffect(() => {
    const newItems = Array.from({ length: 20 }).map((_, i) => ({
      id: i,
      name: CLASS_MEMBERS[Math.floor(Math.random() * CLASS_MEMBERS.length)],
      top: Math.random() * 80 + 10, // 10% to 90% height
      duration: Math.random() * 10 + 10, // 10s to 20s
      delay: Math.random() * 10
    }));
    setItems(newItems);
  }, []);

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden z-0 opacity-40">
      {items.map((item) => (
        <motion.div
          key={item.id}
          initial={{ x: '100vw' }}
          animate={{ x: '-20vw' }}
          transition={{
            duration: item.duration,
            repeat: Infinity,
            ease: "linear",
            delay: item.delay
          }}
          className="absolute whitespace-nowrap text-white font-bold text-lg md:text-2xl tracking-widest drop-shadow-lg"
          style={{ top: `${item.top}%` }}
        >
          {item.name}
        </motion.div>
      ))}
    </div>
  );
};

export function OrganicChemistryMode({ lang, model, onSaveHistory, initialData, onBack }: { lang: 'zh' | 'en', model: string, onSaveHistory: (mode: string, summary: string, data: any) => void, initialData?: any, onBack?: () => void }) {
  const t = TRANSLATIONS[lang];
  const [messages, setMessages] = useState<{role: 'user'|'model', text: string, images?: string[]}[]>(initialData?.messages || []);
  
  useEffect(() => {
    if (initialData?.messages) {
      setMessages(initialData.messages);
    }
  }, [initialData]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [selectedImages, setSelectedImages] = useState<string[]>([]);
  const [activeModel, setActiveModel] = useState(model || 'gemini-3.1-pro-preview');
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const [currentKnowledgeIndex, setCurrentKnowledgeIndex] = useState(Math.floor(Math.random() * CHEMISTRY_KNOWLEDGE[lang].length));
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const quickActions = [
    { id: 'ab', text: t.organicModeQuickAction1 },
    { id: 'isomers', text: t.organicModeQuickAction2 },
    { id: 'conditions', text: t.organicModeQuickAction3 },
  ];

  const models = [
    { id: 'gemini-3.1-pro-preview', name: 'Pro' },
    { id: 'gemini-3-flash-preview', name: 'Flash' },
    { id: 'gemini-3.1-flash-lite-preview', name: 'Flash-Lite' }
  ];

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onloadend = () => {
        setSelectedImages(prev => [...prev, reader.result as string]);
      };
      reader.readAsDataURL(file);
    });
    
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const removeImage = (index: number) => {
    setSelectedImages(prev => prev.filter((_, i) => i !== index));
  };

  const handleRegenerateSvg = (svgCode: string) => {
    const prompt = lang === 'zh' 
      ? `请重新生成下面这个SVG结构式，它在渲染时出现了一些问题（例如文字错位、化学键连接不正确等）。请修正这些问题并重新输出SVG代码：\n\`\`\`xml\n${svgCode}\n\`\`\``
      : `Please regenerate the following SVG structure. There were some issues with its rendering (e.g., misaligned text, incorrect bonds). Please fix these issues and output the corrected SVG code:\n\`\`\`xml\n${svgCode}\n\`\`\``;
    
    handleSend(prompt);
  };

  const handleSend = async (overrideText?: string | React.MouseEvent) => {
    const textToSend = typeof overrideText === 'string' ? overrideText : input.trim();
    if ((!textToSend && selectedImages.length === 0) || isTyping) return;
    
    const userText = textToSend;
    const userImages = [...selectedImages];
    
    setInput('');
    setSelectedImages([]);
    const newUserMsg = { role: 'user' as const, text: userText, images: userImages.length > 0 ? userImages : undefined };
    setMessages(prev => [...prev, newUserMsg]);
    setIsTyping(true);

    try {
      const historyContents = messages.map(m => {
        const parts: any[] = [{ text: m.text }];
        if (m.images && m.images.length > 0) {
          m.images.forEach(img => {
            const base64Data = img.split(',')[1];
            const mimeType = img.split(';')[0].split(':')[1];
            parts.unshift({
              inlineData: { data: base64Data, mimeType }
            });
          });
        }
        return { role: m.role, parts };
      });
      
      const currentParts: any[] = [{ text: userText || (lang === 'zh' ? '请解析这张图片中的有机化学问题。' : 'Please analyze the organic chemistry problem in this image.') }];
      if (userImages.length > 0) {
        userImages.forEach(img => {
          const base64Data = img.split(',')[1];
          const mimeType = img.split(';')[0].split(':')[1];
          currentParts.unshift({
            inlineData: { data: base64Data, mimeType }
          });
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
          const historyMessages = newMessages.map(m => ({ ...m, images: undefined }));
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
        const historyMessages = newMessages.map(m => ({ ...m, images: undefined }));
        onSaveHistory('organic-chemistry', summary, { messages: historyMessages });
        return newMessages;
      });
    } finally {
      setIsTyping(false);
    }
  };

  const isGeneratingAnalysis = isTyping && messages.length >= 2;

  return (
    <div className="fixed inset-0 z-[150] bg-zinc-950 text-white overflow-hidden flex flex-col">
      {/* Global Danmaku Background */}
      <Danmaku />
      
      {/* Top Left Back Button */}
      <div className="absolute top-6 left-6 z-[200]">
        <button 
          onClick={onBack}
          className="p-3 bg-white/10 hover:bg-white/20 border border-white/10 rounded-2xl transition-all active:scale-95 flex items-center gap-2 backdrop-blur-md"
        >
          <ChevronLeft className="w-6 h-6" />
          <span className="font-bold hidden md:inline">返回</span>
        </button>
      </div>

      {/* Full-screen waiting overlay */}
      <AnimatePresence>
        {isGeneratingAnalysis && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-[180] bg-blue-950/95 backdrop-blur-xl flex flex-col items-center justify-center p-8"
          >
            <Loader2 className="w-16 h-16 animate-spin text-blue-400 mb-8" />
            <h2 className="text-2xl font-bold text-white mb-2">
              {lang === 'zh' ? '正在深度解析机理与绘制结构式...' : 'Analyzing mechanism and drawing structures...'}
            </h2>
            <p className="text-zinc-400 mb-12 text-center">
              {lang === 'zh' ? '生成高质量的 SVG 结构式需要一些时间，请稍候。' : 'Generating high-quality SVG structures takes some time, please wait.'}
            </p>

            <div className="max-w-4xl w-full bg-gradient-to-br from-blue-900 to-blue-600 border border-white/20 rounded-[2.5rem] p-10 relative overflow-hidden shadow-[0_40px_80px_rgba(0,0,0,0.5)]">
              {/* Danmaku Layer */}
              <Danmaku />

              <div className="relative z-10">
                <h3 className="text-sm font-bold text-white/80 mb-6 flex items-center gap-2 uppercase tracking-widest">
                  <Beaker className="w-5 h-5" />
                  {lang === 'zh' ? '等待期间复习一下：' : 'Review while waiting:'}
                </h3>
                
                <div className="flex items-center gap-8">
                  <button 
                    onClick={() => setCurrentKnowledgeIndex(prev => (prev - 1 + CHEMISTRY_KNOWLEDGE[lang].length) % CHEMISTRY_KNOWLEDGE[lang].length)}
                    className="p-3 hover:bg-white/10 rounded-full transition-colors text-white/40 hover:text-white shrink-0"
                  >
                    <ChevronLeft className="w-10 h-10" />
                  </button>

                  <div className="flex-1 min-h-[220px] flex flex-col justify-center">
                    <AnimatePresence mode="wait">
                      <motion.div
                        key={currentKnowledgeIndex}
                        initial={{ opacity: 0, x: 30 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -30 }}
                        transition={{ duration: 0.4, ease: "easeOut" }}
                      >
                        <h4 className="text-3xl font-black text-white mb-6 tracking-tight">
                          {CHEMISTRY_KNOWLEDGE[lang][currentKnowledgeIndex].title}
                        </h4>
                        <div className="text-white/90 leading-relaxed markdown-body prose prose-invert prose-lg max-w-none font-medium">
                          <ReactMarkdown 
                            remarkPlugins={[remarkGfm, remarkMath, remarkBreaks]} 
                            rehypePlugins={[rehypeKatex]}
                          >
                            {CHEMISTRY_KNOWLEDGE[lang][currentKnowledgeIndex].content}
                          </ReactMarkdown>
                        </div>
                      </motion.div>
                    </AnimatePresence>
                  </div>

                  <button 
                    onClick={() => setCurrentKnowledgeIndex(prev => (prev + 1) % CHEMISTRY_KNOWLEDGE[lang].length)}
                    className="p-3 hover:bg-white/10 rounded-full transition-colors text-white/40 hover:text-white shrink-0"
                  >
                    <ChevronRight className="w-10 h-10" />
                  </button>
                </div>
                
                <div className="flex gap-2 mt-10 justify-center">
                  {CHEMISTRY_KNOWLEDGE[lang].map((_, idx) => (
                    <div 
                      key={idx} 
                      className={`h-2 rounded-full transition-all duration-500 ${idx === currentKnowledgeIndex ? 'w-10 bg-white' : 'w-2 bg-white/20'}`}
                    />
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex-1 overflow-y-auto p-6 pt-24 max-w-5xl mx-auto w-full flex flex-col relative z-10">
        <div className="mb-12 text-center flex flex-col items-center relative">
          <div className="flex items-center gap-4 mb-4">
            <h2 className="text-5xl font-black text-white flex items-center gap-4 tracking-tighter">
              <Beaker className="w-12 h-12 text-blue-400" />
              {t.organicModeTitle}
            </h2>
            <button 
              onClick={() => setShowHelp(!showHelp)}
              className="p-2 text-zinc-500 hover:text-white transition-colors"
            >
              <HelpCircle className="w-6 h-6" />
            </button>
          </div>
          <p className="text-white/40 text-xl font-medium italic tracking-wide">{t.organicModeSubtitle}</p>

          <AnimatePresence>
            {showHelp && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="w-full max-w-lg bg-white/5 border border-white/10 rounded-3xl p-6 mt-8 text-left overflow-hidden shadow-2xl"
              >
                <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                  <HelpCircle className="w-5 h-5 text-emerald-400" />
                  {t.organicModeInstructions}
                </h3>
                <ul className="text-sm text-zinc-400 space-y-3 list-disc list-inside">
                  <li>{t.organicModeInstruction1}</li>
                  <li>{t.organicModeInstruction2}</li>
                  <li>{t.organicModeInstruction3}</li>
                  <li>{t.organicModeInstruction4}</li>
                </ul>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="flex-1 overflow-y-auto mb-8 space-y-8 custom-scrollbar pr-4">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-white/20 gap-12 py-20">
              <div className="relative">
                <div className="absolute inset-0 bg-emerald-500/20 blur-[100px] rounded-full"></div>
                <Beaker className="w-32 h-32 text-white/10 relative z-10" />
              </div>
              <p className="text-center max-w-lg text-2xl font-bold leading-relaxed">{t.organicModeEmpty}</p>
            </div>
          )}
          
          {messages.map((msg, idx) => (
            <motion.div 
              key={idx}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div className={`max-w-[90%] ${msg.role === 'user' ? 'bg-white text-black' : 'bg-zinc-900 border border-zinc-800 text-zinc-200'} rounded-3xl p-6 shadow-xl`}>
                {msg.images && msg.images.length > 0 && (
                  <div className="flex flex-wrap gap-3 mb-4">
                    {msg.images.map((img, i) => (
                      <img key={i} src={img} alt="Uploaded problem" className="max-w-[300px] max-h-[300px] rounded-2xl border border-white/10 object-contain bg-zinc-950 shadow-inner" />
                    ))}
                  </div>
                )}
                {msg.role === 'model' ? (
                  <div className="markdown-body prose prose-invert max-w-none prose-pre:bg-zinc-950 prose-pre:border prose-pre:border-zinc-800 prose-lg">
                    <ReactMarkdown 
                      remarkPlugins={[remarkGfm, remarkMath, remarkBreaks]} 
                      rehypePlugins={[rehypeRaw, rehypeKatex]}
                      components={MarkdownComponents(lang, handleRegenerateSvg)}
                    >
                      {msg.text}
                    </ReactMarkdown>
                  </div>
                ) : (
                  msg.text && <p className="whitespace-pre-wrap text-lg font-medium">{msg.text}</p>
                )}
              </div>
            </motion.div>
          ))}
          
          {isTyping && !isGeneratingAnalysis && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex justify-start"
            >
              <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 flex items-center gap-4 shadow-xl">
                <Loader2 className="w-6 h-6 animate-spin text-emerald-400" />
                <span className="text-lg font-medium text-zinc-400">
                  {lang === 'zh' ? '正在思考...' : 'Thinking...'}
                </span>
              </div>
            </motion.div>
          )}
          <div ref={chatEndRef} />
        </div>

        <div className="relative max-w-4xl mx-auto w-full pb-10">
          <div className="flex flex-wrap gap-3 mb-6">
            {quickActions.map(action => (
              <button
                key={action.id}
                onClick={() => handleSend(action.text)}
                disabled={isTyping}
                className="px-5 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-full text-sm font-bold text-zinc-300 hover:text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
              >
                {action.text}
              </button>
            ))}
          </div>

          <AnimatePresence>
            {selectedImages.length > 0 && (
              <motion.div 
                initial={{ opacity: 0, y: 20, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 20, scale: 0.95 }}
                className="absolute bottom-full mb-4 left-0 bg-zinc-800/90 backdrop-blur-md p-3 rounded-2xl border border-zinc-700 shadow-2xl flex flex-wrap gap-3 max-w-full overflow-x-auto custom-scrollbar"
              >
                {selectedImages.map((img, idx) => (
                  <div key={idx} className="relative group shrink-0">
                    <img src={img} alt="Selected" className="h-24 rounded-xl object-contain bg-zinc-900 border border-zinc-700" />
                    <button 
                      onClick={() => removeImage(idx)}
                      className="absolute -top-2 -right-2 p-1.5 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          <div className="flex flex-col bg-zinc-900/80 backdrop-blur-md border border-zinc-800 rounded-[2rem] shadow-2xl focus-within:border-emerald-500/50 focus-within:ring-2 focus-within:ring-emerald-500/20 transition-all relative overflow-hidden">
            {/* Model Selection Bar */}
            <div className="flex items-center justify-between px-6 py-3 border-b border-zinc-800/50 bg-zinc-950/50">
              <div className="relative">
                <button
                  onClick={() => setShowModelDropdown(!showModelDropdown)}
                  className="flex items-center gap-2 text-sm font-bold text-zinc-400 hover:text-zinc-200 transition-colors"
                >
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></div>
                  {models.find(m => m.id === activeModel)?.name || 'Model'}
                  <ChevronDown className={`w-4 h-4 transition-transform duration-300 ${showModelDropdown ? 'rotate-180' : ''}`} />
                </button>
                
                <AnimatePresence>
                  {showModelDropdown && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 10 }}
                      className="absolute bottom-full left-0 mb-4 w-56 bg-zinc-800 border border-zinc-700 rounded-2xl shadow-2xl overflow-hidden z-50"
                    >
                      {models.map(m => (
                        <button
                          key={m.id}
                          onClick={() => {
                            setActiveModel(m.id);
                            setShowModelDropdown(false);
                          }}
                          className={`w-full text-left px-5 py-3 text-sm font-medium transition-colors ${activeModel === m.id ? 'bg-emerald-500/20 text-emerald-400' : 'text-zinc-300 hover:bg-zinc-700'}`}
                        >
                          {m.name}
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            <div className="flex items-end gap-3 p-4">
              <input
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                ref={fileInputRef}
                onChange={handleImageUpload}
              />
              <button 
                onClick={() => fileInputRef.current?.click()}
                className="p-4 text-zinc-400 hover:text-emerald-400 hover:bg-emerald-500/10 rounded-2xl transition-all shrink-0 active:scale-90"
                title="上传题目图片"
              >
                <ImageIcon className="w-7 h-7" />
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
                className="flex-1 bg-transparent border-none text-white text-lg focus:ring-0 outline-none resize-none py-4 px-2 max-h-48 custom-scrollbar font-medium"
                rows={1}
                style={{ minHeight: '56px' }}
              />
              
              <button 
                onClick={() => handleSend()}
                disabled={(!input.trim() && selectedImages.length === 0) || isTyping}
                className="p-4 bg-emerald-500 hover:bg-emerald-400 disabled:bg-zinc-800 disabled:text-zinc-600 text-black rounded-2xl transition-all shrink-0 shadow-lg shadow-emerald-500/20 active:scale-90"
              >
                <Send className="w-7 h-7" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
