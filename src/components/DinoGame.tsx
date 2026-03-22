import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Trophy, Timer, RefreshCw, Play, Camera, Gamepad2, Cloud, Trees as TreeIcon, Mountain } from 'lucide-react';

const MemorialScreen = ({ 
  onClose, 
  onRestart, 
  classPhotos, 
  schoolLogoUrl, 
  danmakuItems 
}: { 
  onClose: () => void, 
  onRestart: () => void, 
  classPhotos: string[], 
  schoolLogoUrl: string,
  danmakuItems: any[]
}) => {
  const [step, setStep] = useState<'closed' | 'opening' | 'opened' | 'fullscreen'>('closed');

  const handleClaspClick = () => {
    if (step === 'closed') {
      setStep('opening');
      setTimeout(() => {
        setStep('opened');
        setTimeout(() => {
          setStep('fullscreen');
        }, 1000); // Wait for envelope to slide down
      }, 800); // Wait for flap to open
    }
  };

  return (
    <motion.div 
      className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-[#20b2aa] to-[#001f3f] z-[999999] overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      {/* Danmaku Container */}
      {step === 'fullscreen' && (
        <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
          {danmakuItems.map((item) => (
            <motion.div
              key={item.id}
              initial={{ x: '100vw' }}
              animate={{ x: '-100vw' }}
              transition={{
                duration: item.duration,
                repeat: Infinity,
                ease: "linear",
                delay: item.delay
              }}
              className="absolute whitespace-nowrap text-white/40 font-black text-xl sm:text-3xl tracking-widest drop-shadow-md"
              style={{ top: `${item.top}%` }}
            >
              {item.text}
            </motion.div>
          ))}
        </div>
      )}

      {/* Back Button in Top Left */}
      {step === 'fullscreen' && (
        <div className="absolute top-4 left-4 sm:top-8 sm:left-8 z-[1000000]">
          <button 
            onClick={onClose}
            className="p-3 sm:p-4 bg-white/10 hover:bg-white/20 backdrop-blur-md border border-white/20 rounded-2xl transition-all active:scale-95 group"
          >
            <X className="w-6 h-6 sm:w-8 sm:h-8 text-white group-hover:rotate-90 transition-transform" />
          </button>
        </div>
      )}

      {/* Envelope Back */}
      <AnimatePresence>
        {step !== 'fullscreen' && (
          <motion.div 
            className="absolute z-0 w-[90vw] max-w-3xl aspect-[16/10] pointer-events-none"
            initial={{ y: 0 }}
            animate={{ y: step === 'opened' ? '120vh' : 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1, ease: [0.4, 0, 0.2, 1] }}
          >
            <div className="absolute inset-0 bg-gradient-to-br from-[#005f9e] to-[#229930] rounded-xl shadow-2xl border border-white/20" />
          </motion.div>
        )}
      </AnimatePresence>

      {/* The Card */}
      <motion.div
        layout
        className={`relative ${step === 'fullscreen' ? 'z-50' : 'z-20'} flex flex-col items-center ${step === 'fullscreen' ? 'w-full h-full max-w-6xl px-4 sm:px-8 overflow-y-auto py-8 sm:py-12 hide-scrollbar justify-start' : 'w-[85vw] max-w-2xl aspect-video justify-center'}`}
        initial={false}
        animate={{
          y: step === 'fullscreen' ? 0 : (step === 'opened' ? -20 : 0),
        }}
        transition={{ duration: 1, type: "spring", bounce: 0.2 }}
      >
        {/* Title (Only visible in fullscreen) */}
        <AnimatePresence>
          {step === 'fullscreen' && (
            <motion.div
              layout
              initial={{ y: 50, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 50, opacity: 0 }}
              transition={{ duration: 0.5 }}
              className="mb-4 sm:mb-10 text-center w-full shrink-0"
            >
              <h2 className="text-4xl sm:text-6xl md:text-8xl lg:text-9xl font-black text-white tracking-tighter italic drop-shadow-[0_15px_40px_rgba(0,0,0,0.6)] px-4">
                2021级贯通班
              </h2>
              <div className="h-1 sm:h-2.5 w-full bg-gradient-to-r from-transparent via-white to-transparent mt-3 sm:mt-6 opacity-60" />
            </motion.div>
          )}
        </AnimatePresence>

        {/* The Actual Card (Photo + Quote) */}
        <motion.div
          layout
          className="w-full max-w-4xl aspect-video bg-black/40 rounded-[1.5rem] sm:rounded-[4rem] overflow-hidden border-2 sm:border-8 border-white/20 shadow-[0_50px_120px_rgba(0,0,0,0.7)] relative group shrink-0"
        >
          {classPhotos.length > 0 ? (
            <img 
              src={classPhotos[0]} 
              alt="毕业合照" 
              className="w-full h-full object-cover"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center text-white/20">
              <Camera className="w-12 h-12 sm:w-40 sm:h-40 mb-4 sm:mb-8" />
              <span className="text-sm sm:text-3xl font-black uppercase tracking-[0.2em] sm:tracking-[0.8em]">Awaiting Memorial Photo</span>
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/20 to-transparent flex flex-col justify-end p-4 sm:p-16">
            <motion.p 
              animate={{ y: [0, -5, 0] }}
              transition={{ repeat: Infinity, duration: 4 }}
              className="text-lg sm:text-3xl md:text-5xl font-black text-white italic mb-1 sm:mb-4 drop-shadow-lg leading-tight"
            >
              “愿此去繁花似锦，再相逢依然如故”
            </motion.p>
            <p className="text-white/70 text-xs sm:text-2xl font-bold tracking-[0.1em] sm:tracking-[0.3em] uppercase">Class of 2021 • Graduation Memorial</p>
          </div>
        </motion.div>

        {/* Buttons and Footer (Only visible in fullscreen) */}
        <AnimatePresence>
          {step === 'fullscreen' && (
            <motion.div
              layout
              initial={{ y: 30, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 30, opacity: 0 }}
              transition={{ duration: 0.5 }}
              className="mt-8 sm:mt-16 flex flex-col items-center w-full shrink-0"
            >
              <div className="flex flex-col sm:flex-row gap-4 sm:gap-12 w-full sm:w-auto px-4 sm:px-0">
                <button 
                  onClick={onRestart}
                  className="px-8 py-3 sm:px-16 sm:py-6 bg-white/10 hover:bg-white/20 backdrop-blur-xl border-2 border-white/30 text-white font-black text-lg sm:text-3xl rounded-[1rem] sm:rounded-[2rem] transition-all active:scale-95 shadow-2xl"
                >
                  再玩一次
                </button>
                <button 
                  onClick={onClose}
                  className="px-8 py-3 sm:px-16 sm:py-6 bg-white text-[#0074D9] font-black text-lg sm:text-3xl rounded-[1rem] sm:rounded-[2rem] transition-all active:scale-95 shadow-[0_25px_60px_rgba(255,255,255,0.4)]"
                >
                  毕业快乐
                </button>
              </div>
              <p className="mt-8 sm:mt-16 text-white/50 text-[10px] sm:text-base font-black uppercase tracking-[0.2em] sm:tracking-[0.8em] italic text-center px-4">
                致 2021级贯通班 全体同学 • 永远的 casino 帮
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Envelope Front (Pocket) */}
      <AnimatePresence>
        {step !== 'fullscreen' && (
          <motion.div 
            className="absolute z-30 w-[90vw] max-w-3xl aspect-[16/10] pointer-events-none"
            initial={{ y: 0 }}
            animate={{ y: step === 'opened' ? '120vh' : 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1, ease: [0.4, 0, 0.2, 1] }}
          >
            {/* Envelope Side Flaps */}
            <div className="absolute inset-0 z-10 drop-shadow-sm">
               <div className="absolute inset-0 bg-gradient-to-br from-[#0074D9] to-[#2ECC40]" style={{ clipPath: 'polygon(0 0, 50% 50%, 0 100%)' }} />
               <div className="absolute inset-0 bg-gradient-to-br from-[#0074D9] to-[#2ECC40]" style={{ clipPath: 'polygon(100% 0, 50% 50%, 100% 100%)' }} />
               {/* Shading */}
               <div className="absolute inset-0 bg-black/10" style={{ clipPath: 'polygon(0 0, 50% 50%, 0 100%)' }} />
               <div className="absolute inset-0 bg-black/10" style={{ clipPath: 'polygon(100% 0, 50% 50%, 100% 100%)' }} />
            </div>

            {/* Envelope Bottom Flap */}
            <div className="absolute inset-0 z-20 drop-shadow-md">
               <div className="absolute inset-0 bg-gradient-to-br from-[#0074D9] to-[#2ECC40]" style={{ clipPath: 'polygon(0 100%, 50% 50%, 100% 100%)' }} />
               <div className="absolute inset-0 bg-black/20" style={{ clipPath: 'polygon(0 100%, 50% 50%, 100% 100%)' }} />
               <svg className="absolute inset-0 w-full h-full pointer-events-none">
                 <line x1="0" y1="100%" x2="50%" y2="50%" stroke="rgba(255,255,255,0.3)" strokeWidth="2" />
                 <line x1="100%" y1="100%" x2="50%" y2="50%" stroke="rgba(255,255,255,0.3)" strokeWidth="2" />
               </svg>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Envelope Top Flap */}
      <AnimatePresence>
        {step !== 'fullscreen' && (
          <motion.div 
            className={`absolute ${step === 'opened' ? 'z-10' : 'z-40'} w-[90vw] max-w-3xl aspect-[16/10] pointer-events-none`}
            initial={{ y: 0 }}
            animate={{ y: step === 'opened' ? '120vh' : 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1, ease: [0.4, 0, 0.2, 1] }}
          >
            <motion.div 
              className="absolute top-0 left-0 right-0 h-full origin-top z-30 drop-shadow-xl"
              initial={{ rotateX: 0 }}
              animate={{ rotateX: step === 'opening' || step === 'opened' ? 180 : 0 }}
              transition={{ duration: 0.8, ease: [0.4, 0, 0.2, 1] }}
              style={{ transformStyle: 'preserve-3d' }}
            >
              {/* Front of flap */}
              <div 
                className="absolute inset-0 bg-gradient-to-b from-[#0074D9] to-[#2ECC40] flex flex-col items-center justify-center shadow-lg" 
                style={{ 
                  clipPath: 'polygon(0 0, 100% 0, 100% 35%, 50% 65%, 0 35%)', 
                  backfaceVisibility: 'hidden',
                  WebkitBackfaceVisibility: 'hidden',
                  transform: 'translateZ(1px)'
                }}
              >
                 {/* Motto Text */}
                 <motion.span 
                   className="text-white font-serif text-xl sm:text-3xl tracking-[0.3em] font-bold drop-shadow-md mb-24"
                   animate={{ opacity: step === 'closed' ? 1 : 0 }}
                   transition={{ duration: 0.4 }}
                 >
                   明理 勤奋 严谨 创新
                 </motion.span>
              </div>
              <svg 
                className="absolute inset-0 w-full h-full pointer-events-none" 
                style={{ 
                  backfaceVisibility: 'hidden',
                  WebkitBackfaceVisibility: 'hidden',
                  transform: 'translateZ(1px)'
                }}
              >
                 <line x1="0" y1="35%" x2="50%" y2="65%" stroke="rgba(255,255,255,0.2)" strokeWidth="1" />
                 <line x1="100%" y1="35%" x2="50%" y2="65%" stroke="rgba(255,255,255,0.2)" strokeWidth="1" />
              </svg>
              
              {/* Back of flap (visible when open) */}
              <div 
                className="absolute inset-0 bg-[#005f9e] shadow-inner" 
                style={{ 
                  clipPath: 'polygon(0 0, 100% 0, 100% 35%, 50% 65%, 0 35%)', 
                  backfaceVisibility: 'hidden', 
                  WebkitBackfaceVisibility: 'hidden',
                  transform: 'rotateX(180deg) translateZ(1px)' 
                }} 
              />
            </motion.div>

            {/* Clasp (School Emblem) */}
            <motion.button 
              onClick={handleClaspClick}
              className={`absolute left-1/2 top-[65%] -translate-x-1/2 -translate-y-1/2 w-20 h-20 sm:w-24 sm:h-24 bg-white rounded-full shadow-[0_10px_30px_rgba(0,0,0,0.5)] flex items-center justify-center z-50 border-4 border-[#0074D9] overflow-hidden cursor-pointer hover:scale-110 transition-transform pointer-events-auto ${step !== 'closed' ? 'pointer-events-none' : ''}`}
              animate={{ 
                opacity: step === 'closed' ? 1 : 0,
                scale: step === 'closed' ? 1 : 0,
              }}
              transition={{ duration: 0.3 }}
            >
              {schoolLogoUrl ? (
                <img src={schoolLogoUrl} alt="School Logo" className="w-14 h-14 sm:w-16 sm:h-16 object-contain" />
              ) : (
                <div className="w-14 h-14 sm:w-16 sm:h-16 bg-blue-100 rounded-full flex items-center justify-center">
                  <span className="text-[#0074D9] font-bold text-xs">点击开启</span>
                </div>
              )}
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

interface DinoGameProps {
  dinoType: 'trex' | 'triceratops' | 'velociraptor';
  onClose: () => void;
  isAdmin: boolean;
  classPhotos: string[];
  schoolLogoUrl: string;
  lang: 'zh' | 'en';
}

const DINO_CONFIG = {
  trex: { 
    name: '霸王龙', 
    color: '#ff4444', 
    speed: 1, 
    jump: 12,
    path: "M10,30 L30,30 L35,10 L45,10 L45,25 L40,25 L40,35 L30,45 L10,45 L5,35 Z" // Simplified T-Rex
  },
  triceratops: { 
    name: '三角龙', 
    color: '#44ff44', 
    speed: 0.8, 
    jump: 10,
    path: "M5,40 L15,40 L15,30 L25,20 L35,30 L45,40 L45,45 L5,45 Z" // Simplified Triceratops
  },
  velociraptor: { 
    name: '迅猛龙', 
    color: '#4444ff', 
    speed: 1.2, 
    jump: 14,
    path: "M5,45 L15,40 L35,40 L45,30 L40,25 L30,35 L10,45 Z" // Simplified Velociraptor
  },
};

const DINO_ART = {
  trex: [
    [
      "        XXXXXXX ",
      "       XXOXXXXXX",
      "       XXXXX    ",
      "       XXXXXXXX ",
      " X     XXXX     ",
      " XX   XXXXXX    ",
      " XXX XXXXXXXX   ",
      " XXXXXXXXXXX    ",
      "  XXXXXXXXX     ",
      "   XXXXXXX      ",
      "    X    X      ",
      "   XX           "
    ],
    [
      "        XXXXXXX ",
      "       XXOXXXXXX",
      "       XXXXX    ",
      "       XXXXXXXX ",
      " X     XXXX     ",
      " XX   XXXXXX    ",
      " XXX XXXXXXXX   ",
      " XXXXXXXXXXX    ",
      "  XXXXXXXXX     ",
      "   XXXXXXX      ",
      "    X    X      ",
      "         XX     "
    ]
  ],
  triceratops: [
    [
      "                ",
      "                ",
      "                ",
      "                ",
      "  X             ",
      " XXX       XXXX ",
      "XXXXX    XXOXXXX",
      "XXXXXXX XXXXXXXXX",
      " XXXXXXXXXXXXXXXX",
      "  XXXXXXXXXXXXXXX",
      "   XXX      XXX  ",
      "   XX       XX   "
    ],
    [
      "                ",
      "                ",
      "                ",
      "                ",
      "  X             ",
      " XXX       XXXX ",
      "XXXXX    XXOXXXX",
      "XXXXXXX XXXXXXXXX",
      " XXXXXXXXXXXXXXXX",
      "  XXXXXXXXXXXXXXX",
      "    XXX      XXX ",
      "    XX       XX  "
    ]
  ],
  velociraptor: [
    [
      "                ",
      "             XXXX",
      "            XXOXX",
      "            XXX  ",
      "           XXXX  ",
      " X       XXXXX   ",
      " XX    XXXXXXX   ",
      " XXXXXXXXXXXXX   ",
      "  XXXXXXXXXXX    ",
      "   XXXXXXXX      ",
      "    X    X       ",
      "   XX            "
    ],
    [
      "                ",
      "             XXXX",
      "            XXOXX",
      "            XXX  ",
      "           XXXX  ",
      " X       XXXXX   ",
      " XX    XXXXXXX   ",
      " XXXXXXXXXXXXX   ",
      "  XXXXXXXXXXX    ",
      "   XXXXXXXX      ",
      "    X    X       ",
      "         XX      "
    ]
  ]
};

const DinoPixelArtUI = ({ type, color, className }: { type: keyof typeof DINO_ART, color: string, className?: string }) => {
  const art = DINO_ART[type][0];
  const rows = art.length;
  const cols = art[0].length;

  return (
    <div className={`grid ${className}`} style={{ 
      gridTemplateRows: `repeat(${rows}, 1fr)`,
      gridTemplateColumns: `repeat(${cols}, 1fr)`,
      aspectRatio: `${cols}/${rows}`
    }}>
      {art.map((row, y) => 
        row.split('').map((char, x) => (
          <div key={`${x}-${y}`} style={{ 
            backgroundColor: char === 'X' ? color : char === 'O' ? 'white' : 'transparent' 
          }} />
        ))
      )}
    </div>
  );
};

const OBSTACLE_ART = {
  tree: [
    "      XX      ",
    "     XXXX     ",
    "    XXXXXX    ",
    "   XXXXXXXX   ",
    "  XXXXXXXXXX  ",
    "      XX      ",
    "     XXXX     ",
    "    XXXXXX    ",
    "   XXXXXXXX   ",
    "  XXXXXXXXXX  ",
    "      XX      ",
    "      XX      "
  ],
  stone: [
    "              ",
    "              ",
    "              ",
    "              ",
    "              ",
    "              ",
    "              ",
    "    XXXXXX    ",
    "  XXXXXXXXXX  ",
    " XXXXXXXXXXXX ",
    " XXXXXXXXXXXX ",
    "XXXXXXXXXXXXXX"
  ]
};

const CLASS_MEMBERS = [
  '包涵', '陈明见', '崔天浩', '段柯言', '房奥洋', '冯子夏', '高嘉怡', '郭晗阳', '顾雨晴',
  '郝天一', '和诗涵', '黄采薇', '贾灵坤', '姜亦铭', '姜雨彤', '金孟源', '李嘉桐', '刘玟言',
  '刘雅菲', '刘梓涵', '牛思程', '唐子渔', '王若熹', '温凯翔', '闻钰翔', '吴琬琳', '薛云朗',
  '徐望童', '叶瑾宸', '尤子谦', '查俊祺', '张景洋', '张祎辰', '赵思源', '邹韫瞳'
];

export function DinoGame({ dinoType, onClose, isAdmin, classPhotos, schoolLogoUrl, lang }: DinoGameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [gameState, setGameState] = useState<'start' | 'playing' | 'gameover' | 'easteregg'>('start');
  const [score, setScore] = useState(0);
  const [survivalTime, setSurvivalTime] = useState(0);

  // Game Logic
  const requestRef = useRef<number>(0);
  const gameData = useRef({
    dino: { x: 100, y: 0, width: 60, height: 60, dy: 0, jumpForce: DINO_CONFIG[dinoType].jump, gravity: 0.6, isJumping: false },
    obstacles: [] as { x: number, y: number, width: number, height: number, type: 'tree' | 'stone' }[],
    clouds: [] as { x: number, y: number, speed: number, size: number }[],
    frame: 0,
    speed: 6 * DINO_CONFIG[dinoType].speed,
    startTime: 0,
    groundOffset: 0,
  });

  const jump = () => {
    if (!gameData.current.dino.isJumping) {
      gameData.current.dino.dy = -gameData.current.dino.jumpForce;
      gameData.current.dino.isJumping = true;
    }
  };

  const drawPixelArt = (ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string, art: string[], type?: string) => {
    for (let row = 0; row < art.length; row++) {
      for (let col = 0; col < art[row].length; col++) {
        if (art[row][col] === 'X') {
          if (type === 'tree' && row >= 10) {
            ctx.fillStyle = '#795548'; // Trunk color
          } else {
            ctx.fillStyle = color;
          }
          ctx.fillRect(x + col * size, y + row * size, size, size);
        } else if (art[row][col] === 'O') {
          ctx.fillStyle = 'white';
          ctx.fillRect(x + col * size, y + row * size, size, size);
        }
      }
    }
  };

  const drawDino = (ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number) => {
    const frameIndex = Math.floor(gameData.current.frame / 10) % 2;
    const art = DINO_ART[dinoType][gameData.current.dino.isJumping ? 0 : frameIndex];
    // The art is 16 cols x 12 rows. We use a fixed pixel size of 4.
    // 16*4 = 64 width, 12*4 = 48 height.
    // Adjust x and y slightly to center it in the hitbox.
    drawPixelArt(ctx, x - 2, y, 4, DINO_CONFIG[dinoType].color, art);
  };

  const drawObstacle = (ctx: CanvasRenderingContext2D, obs: any) => {
    const art = OBSTACLE_ART[obs.type as 'tree' | 'stone'];
    const color = obs.type === 'tree' ? '#2E7D32' : '#9E9E9E';
    // Obstacle hitbox is 40x48 for tree, 30x48 for stone.
    // Art is 14x12. Pixel size 4 -> 56x48.
    drawPixelArt(ctx, obs.x - 8, obs.y, 4, color, art, obs.type);
  };

  const update = (time: number) => {
    if (gameState !== 'playing') return;

    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx || !canvas) return;

    // Responsive Scaling Logic
    const virtualHeight = 600;
    const scale = canvas.height / virtualHeight;
    const virtualWidth = canvas.width / scale;

    if (!gameData.current.startTime) gameData.current.startTime = time;
    const elapsed = (time - gameData.current.startTime) / 1000;
    setSurvivalTime(elapsed);
    const currentScore = Math.floor(elapsed * 3.1);
    setScore(currentScore);

    if (currentScore >= 62) {
      setGameState('easteregg');
      return;
    }

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    ctx.save();
    ctx.scale(scale, scale);

    // Draw Background (Sky)
    const gradient = ctx.createLinearGradient(0, 0, 0, virtualHeight);
    gradient.addColorStop(0, '#87CEEB'); // Sky blue
    gradient.addColorStop(1, '#E0F6FF'); // Light blue at horizon
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, virtualWidth, virtualHeight);

    // Update & Draw Clouds
    if (gameData.current.frame % 100 === 0) {
      gameData.current.clouds.push({
        x: virtualWidth + 50,
        y: Math.random() * 150 + 20,
        speed: Math.random() * 0.5 + 0.2,
        size: Math.random() * 30 + 20
      });
    }
    gameData.current.clouds.forEach((cloud, i) => {
      cloud.x -= cloud.speed;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
      ctx.beginPath();
      ctx.arc(cloud.x, cloud.y, cloud.size, 0, Math.PI * 2);
      ctx.arc(cloud.x + cloud.size * 0.6, cloud.y - cloud.size * 0.3, cloud.size * 0.8, 0, Math.PI * 2);
      ctx.arc(cloud.x + cloud.size * 1.2, cloud.y, cloud.size * 0.9, 0, Math.PI * 2);
      ctx.fill();
    });
    gameData.current.clouds = gameData.current.clouds.filter(c => c.x + c.size * 2 > -50);

    // Ground
    const groundY = virtualHeight - 60;
    ctx.fillStyle = '#4CAF50'; // Green grass
    ctx.fillRect(0, groundY, virtualWidth, virtualHeight - groundY);

    // Ground details (scrolling grass blades)
    gameData.current.groundOffset = (gameData.current.groundOffset + gameData.current.speed) % 100;
    ctx.fillStyle = '#388E3C'; // Darker green for grass blades
    for (let i = -100; i < virtualWidth + 100; i += 40) {
      const xPos = i - gameData.current.groundOffset;
      ctx.beginPath();
      ctx.moveTo(xPos, groundY + 10);
      ctx.lineTo(xPos + 5, groundY);
      ctx.lineTo(xPos + 10, groundY + 10);
      ctx.fill();
      
      ctx.beginPath();
      ctx.moveTo(xPos + 20, groundY + 25);
      ctx.lineTo(xPos + 25, groundY + 15);
      ctx.lineTo(xPos + 30, groundY + 25);
      ctx.fill();
    }

    // Update Dino
    const { dino } = gameData.current;
    dino.dy += dino.gravity;
    dino.y += dino.dy;

    const dinoGroundY = groundY - dino.height;
    if (dino.y > dinoGroundY) {
      dino.y = dinoGroundY;
      dino.dy = 0;
      dino.isJumping = false;
    }

    // Draw Dino
    drawDino(ctx, dino.x, dino.y, dino.width, dino.height);

    // Update Obstacles
    gameData.current.frame++;
    if (gameData.current.frame % 80 === 0) {
      const type = Math.random() > 0.5 ? 'tree' : 'stone';
      gameData.current.obstacles.push({
        x: virtualWidth + 50,
        y: groundY - 48,
        width: 40,
        height: 48,
        type
      });
    }

    gameData.current.obstacles.forEach((obs, i) => {
      obs.x -= gameData.current.speed;

      // Collision detection (slightly smaller hitbox for fairness)
      const padding = 10;
      if (
        dino.x + padding < obs.x + obs.width - padding &&
        dino.x + dino.width - padding > obs.x + padding &&
        dino.y + padding < obs.y + obs.height - padding &&
        dino.y + dino.height - padding > obs.y + padding
      ) {
        setGameState('gameover');
      }

      // Draw Obstacle
      drawObstacle(ctx, obs);
    });

    // Remove off-screen obstacles
    gameData.current.obstacles = gameData.current.obstacles.filter(obs => obs.x + obs.width > 0);

    ctx.restore();
    requestRef.current = requestAnimationFrame(update);
  };

  useEffect(() => {
    const handleResize = () => {
      if (canvasRef.current) {
        canvasRef.current.width = window.innerWidth;
        canvasRef.current.height = window.innerHeight;
      }
    };
    window.addEventListener('resize', handleResize);
    handleResize();
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (gameState === 'playing') {
      requestRef.current = requestAnimationFrame(update);
    } else {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    }
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [gameState]);

  const [danmakuItems, setDanmakuItems] = useState<{id: number, text: string, top: number, delay: number, duration: number}[]>([]);

  useEffect(() => {
    if (gameState !== 'easteregg') return;

    const items: any[] = [];
    const lanes = 12; // 12 lanes across the screen
    
    // Shuffle members to make it random
    const shuffled = [...CLASS_MEMBERS].sort(() => Math.random() - 0.5);

    shuffled.forEach((name, i) => {
      const lane = i % lanes;
      const duration = 20; // Constant duration ensures relative spacing is maintained when looping
      
      const itemsInThisLane = Math.floor(i / lanes);
      const totalItemsInLane = Math.ceil(CLASS_MEMBERS.length / lanes);
      // Calculate the gap between items in the same lane to prevent overlap
      const gap = duration / totalItemsInLane;
      
      // Add a small random offset to the delay, but keep it within the gap to avoid overlap
      const delay = itemsInThisLane * gap + (Math.random() * (gap * 0.4));
      
      items.push({
        id: i,
        text: name,
        top: (lane / lanes) * 80 + 10, // Distribute between 10% and 90% height
        delay,
        duration
      });
    });

    setDanmakuItems(items);
  }, [gameState]);

  const startGame = () => {
    const canvas = canvasRef.current;
    const groundY = (canvas?.height || 600) - 60;
    gameData.current = {
      dino: { x: 100, y: groundY - 48, width: 48, height: 48, dy: 0, jumpForce: DINO_CONFIG[dinoType].jump, gravity: 0.6, isJumping: false },
      obstacles: [],
      clouds: [],
      frame: 0,
      speed: 7 * DINO_CONFIG[dinoType].speed,
      startTime: 0,
      groundOffset: 0,
    };
    setScore(0);
    setSurvivalTime(0);
    setGameState('playing');
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'ArrowUp') {
        if (gameState === 'playing') jump();
        else if (gameState === 'start' || gameState === 'gameover') startGame();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [gameState]);

  return createPortal(
    <div className="fixed inset-0 z-[999999] bg-zinc-950 flex flex-col overflow-hidden">
      {/* HUD Overlay */}
      <div className="absolute top-0 left-0 right-0 p-4 sm:p-6 flex items-center justify-between z-50 pointer-events-none">
        <div className="flex items-center gap-2 sm:gap-4 pointer-events-auto">
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-white/10 backdrop-blur-md flex items-center justify-center border border-white/10">
            <Gamepad2 className="w-6 h-6 sm:w-7 sm:h-7 text-white" />
          </div>
          <div className="hidden min-[450px]:block">
            <h3 className="text-white text-sm sm:text-xl font-black tracking-tight">{DINO_CONFIG[dinoType].name} 跑酷</h3>
            <div className="flex items-center gap-1 sm:gap-2">
              <div className="w-1.5 h-1.5 sm:w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
              <span className="text-[8px] sm:text-[10px] text-white/40 uppercase tracking-widest font-bold">Live Session</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4 sm:gap-8 pointer-events-auto">
          <div className="text-right relative">
            <div className="text-[8px] sm:text-[10px] text-white/40 uppercase tracking-widest font-bold mb-0.5 sm:mb-1">
              {lang === 'zh' ? '当前积分' : 'Current Score'}
            </div>
            <div className="text-xl sm:text-3xl font-mono text-indigo-400 font-black tracking-tighter">{score}</div>
            {/* Hidden skip button */}
            <button 
              onClick={() => setGameState('easteregg')}
              className="absolute inset-0 w-full h-full opacity-0 cursor-default z-[60]"
              aria-label="Skip to Easter Egg"
            />
          </div>
          <button 
            onClick={onClose}
            className="p-2 sm:p-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl sm:rounded-2xl transition-all active:scale-95"
          >
            <X className="w-6 h-6 sm:w-8 sm:h-8 text-white/60" />
          </button>
        </div>
      </div>

      {/* Game Canvas */}
      <canvas 
        ref={canvasRef} 
        className="w-full h-full cursor-pointer"
        onClick={() => gameState === 'playing' ? jump() : startGame()}
      />

      {/* UI States */}
      <AnimatePresence>
        {gameState === 'start' && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-b from-[#87CEEB]/30 via-[#E0F6FF]/30 to-[#4CAF50]/30 backdrop-blur-md z-10 p-6 text-center"
          >
            <motion.div 
              animate={{ y: [0, -30, 0] }}
              transition={{ repeat: Infinity, duration: 0.6, ease: "easeOut" }}
              className="w-24 h-24 sm:w-32 sm:h-32 flex items-center justify-center mb-6 sm:mb-8"
            >
              <DinoPixelArtUI 
                type={dinoType} 
                color={DINO_CONFIG[dinoType].color} 
                className="w-full h-full drop-shadow-[0_0_20px_rgba(255,255,255,0.4)]" 
              />
            </motion.div>
            <h2 className="text-4xl sm:text-6xl font-black text-white mb-4 tracking-tighter uppercase drop-shadow-[0_4px_8px_rgba(0,0,0,0.3)]">
              {lang === 'zh' ? '准备好了吗？' : 'Ready?'}
            </h2>
            <p className="text-white text-xl sm:text-2xl mb-2 font-bold tracking-wide drop-shadow-[0_2px_4px_rgba(0,0,0,0.2)]">
              {lang === 'zh' ? '目标：获得 62 分' : 'Goal: Get 62 Points'}
            </p>
            <p className="text-white/80 text-base sm:text-lg mb-8 sm:mb-10 font-medium drop-shadow-sm">
              {lang === 'zh' ? '点击屏幕或按 ' : 'Click or press '}
              <span className="px-2 py-1 bg-white/30 rounded border border-white/40 text-white font-mono">SPACE</span>
              {lang === 'zh' ? ' 开始' : ' to start'}
            </p>
            <button 
              onClick={startGame}
              className="px-10 py-3 sm:px-12 sm:py-4 bg-white text-black font-black text-lg sm:text-xl rounded-2xl hover:bg-zinc-100 transition-all active:scale-95 shadow-[0_10px_30px_rgba(0,0,0,0.15)]"
            >
              {lang === 'zh' ? '开始游戏' : 'Start Game'}
            </button>
          </motion.div>
        )}

        {gameState === 'gameover' && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-b from-[#87CEEB]/30 via-[#E0F6FF]/30 to-[#4CAF50]/30 backdrop-blur-md z-10 p-6 text-center"
          >
            <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-3xl bg-white/20 border border-white/30 flex items-center justify-center mb-6 sm:mb-8 shadow-xl">
              <RefreshCw className="w-10 h-10 sm:w-12 sm:h-12 text-white" />
            </div>
            <h2 className="text-4xl sm:text-6xl font-black text-white mb-4 tracking-tighter uppercase drop-shadow-[0_4px_8px_rgba(0,0,0,0.3)]">Game Over</h2>
            <p className="text-white text-lg sm:text-xl mb-8 sm:mb-10 font-bold drop-shadow-sm">
              {lang === 'zh' ? `获得了 ${score} 分，再接再厉！` : `Obtained ${score} points, keep it up!`}
            </p>
            <button 
              onClick={startGame}
              className="px-10 py-3 sm:px-12 sm:py-4 bg-white text-black font-black text-lg sm:text-xl rounded-2xl hover:bg-zinc-100 transition-all active:scale-95 shadow-[0_10px_30px_rgba(0,0,0,0.15)]"
            >
              {lang === 'zh' ? '重新开始' : 'Restart'}
            </button>
          </motion.div>
        )}

        {gameState === 'easteregg' && (
          <MemorialScreen 
            onClose={onClose}
            onRestart={startGame}
            classPhotos={classPhotos}
            schoolLogoUrl={schoolLogoUrl}
            danmakuItems={danmakuItems}
          />
        )}
      </AnimatePresence>

      {/* Footer Info */}
      <div className="absolute bottom-4 sm:bottom-6 left-4 sm:left-6 right-4 sm:right-6 flex items-center justify-between pointer-events-none opacity-10 sm:opacity-20">
        <div className="text-[8px] sm:text-[10px] font-mono text-white tracking-widest uppercase">
          System Status: Optimal
        </div>
        <div className="text-[8px] sm:text-[10px] font-mono text-white tracking-widest uppercase hidden min-[450px]:block">
          Build v1.0.21-Guantong // 2026
        </div>
      </div>
    </div>,
    document.body
  );
}
