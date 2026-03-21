import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Trophy, Timer, RefreshCw, Play, Camera, Gamepad2, Cloud, Trees as TreeIcon, Mountain } from 'lucide-react';

interface DinoGameProps {
  dinoType: 'trex' | 'triceratops' | 'velociraptor';
  onClose: () => void;
  isAdmin: boolean;
  classPhotos: string[];
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

const CLASS_MEMBERS = [
  '包涵', '陈明见', '崔天浩', '段柯言', '房奥洋', '冯子夏', '高嘉怡', '郭晗阳', '顾雨晴',
  '郝天一', '和诗涵', '黄采薇', '贾灵坤', '姜亦铭', '姜雨彤', '金孟源', '李嘉桐', '刘玟言',
  '刘雅菲', '刘梓涵', '牛思程', '唐子渔', '王若熹', '温凯翔', '闻钰翔', '吴琬琳', '薛云朗',
  '徐望童', '叶瑾宸', '尤子谦', '查俊祺', '张景洋', '张祎辰', '赵思源', '邹韫瞳'
];

export function DinoGame({ dinoType, onClose, isAdmin, classPhotos, lang }: DinoGameProps) {
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

  const drawDino = (ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number) => {
    ctx.save();
    ctx.translate(x, y);
    
    // Simple animation: slight rotation when jumping or running
    if (gameData.current.dino.isJumping) {
      ctx.rotate(-0.1);
    } else {
      ctx.rotate(Math.sin(gameData.current.frame * 0.2) * 0.05);
    }

    ctx.fillStyle = DINO_CONFIG[dinoType].color;
    
    // Draw body based on type
    if (dinoType === 'trex') {
      // Body
      ctx.fillRect(10, 10, 30, 30);
      // Head
      ctx.fillRect(30, 0, 25, 20);
      // Tail
      ctx.beginPath();
      ctx.moveTo(10, 20);
      ctx.lineTo(0, 40);
      ctx.lineTo(15, 35);
      ctx.fill();
      // Legs
      const legOffset = Math.sin(gameData.current.frame * 0.2) * 5;
      ctx.fillRect(15, 40, 8, 15 + (gameData.current.dino.isJumping ? 0 : legOffset));
      ctx.fillRect(27, 40, 8, 15 + (gameData.current.dino.isJumping ? 0 : -legOffset));
      // Eye
      ctx.fillStyle = 'white';
      ctx.fillRect(45, 5, 4, 4);
    } else if (dinoType === 'triceratops') {
      // Body
      ctx.beginPath();
      ctx.ellipse(25, 30, 25, 15, 0, 0, Math.PI * 2);
      ctx.fill();
      // Head/Frill
      ctx.beginPath();
      ctx.arc(45, 25, 15, -Math.PI/2, Math.PI/2);
      ctx.fill();
      // Horns
      ctx.fillStyle = 'white';
      ctx.beginPath();
      ctx.moveTo(45, 15); ctx.lineTo(55, 5); ctx.lineTo(50, 18); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(45, 25); ctx.lineTo(58, 20); ctx.lineTo(50, 28); ctx.fill();
      // Legs
      ctx.fillStyle = DINO_CONFIG[dinoType].color;
      const legOffset = Math.sin(gameData.current.frame * 0.2) * 5;
      ctx.fillRect(10, 40, 8, 10 + (gameData.current.dino.isJumping ? 0 : legOffset));
      ctx.fillRect(32, 40, 8, 10 + (gameData.current.dino.isJumping ? 0 : -legOffset));
    } else {
      // Velociraptor
      ctx.fillRect(15, 20, 30, 15); // Body
      ctx.fillRect(40, 10, 20, 10); // Head
      // Neck
      ctx.beginPath();
      ctx.moveTo(35, 20); ctx.lineTo(45, 10); ctx.lineTo(50, 20); ctx.fill();
      // Tail
      ctx.beginPath();
      ctx.moveTo(15, 25); ctx.lineTo(0, 15); ctx.lineTo(15, 30); ctx.fill();
      // Legs
      const legOffset = Math.sin(gameData.current.frame * 0.2) * 5;
      ctx.fillRect(20, 35, 6, 15 + (gameData.current.dino.isJumping ? 0 : legOffset));
      ctx.fillRect(34, 35, 6, 15 + (gameData.current.dino.isJumping ? 0 : -legOffset));
      // Eye
      ctx.fillStyle = 'white';
      ctx.fillRect(52, 12, 3, 3);
    }
    
    ctx.restore();
  };

  const drawObstacle = (ctx: CanvasRenderingContext2D, obs: any) => {
    ctx.save();
    ctx.translate(obs.x, obs.y);
    
    if (obs.type === 'tree') {
      // Trunk
      ctx.fillStyle = '#5d4037';
      ctx.fillRect(obs.width/2 - 4, obs.height - 10, 8, 10);
      // Leaves
      ctx.fillStyle = '#2e7d32';
      ctx.beginPath();
      ctx.moveTo(0, obs.height - 10);
      ctx.lineTo(obs.width/2, 0);
      ctx.lineTo(obs.width, obs.height - 10);
      ctx.fill();
    } else {
      // Stone
      ctx.fillStyle = '#757575';
      ctx.beginPath();
      ctx.moveTo(0, obs.height);
      ctx.lineTo(obs.width * 0.2, obs.height * 0.4);
      ctx.lineTo(obs.width * 0.5, 0);
      ctx.lineTo(obs.width * 0.8, obs.height * 0.3);
      ctx.lineTo(obs.width, obs.height);
      ctx.fill();
      // Highlights
      ctx.fillStyle = '#9e9e9e';
      ctx.fillRect(obs.width * 0.3, obs.height * 0.2, 4, 4);
    }
    
    ctx.restore();
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
    gradient.addColorStop(0, '#0c0c0e');
    gradient.addColorStop(1, '#1a1a1e');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, virtualWidth, virtualHeight);

    // Update & Draw Clouds
    if (gameData.current.frame % 150 === 0) {
      gameData.current.clouds.push({
        x: virtualWidth,
        y: Math.random() * 100 + 20,
        speed: Math.random() * 0.5 + 0.2,
        size: Math.random() * 40 + 20
      });
    }
    gameData.current.clouds.forEach((cloud, i) => {
      cloud.x -= cloud.speed;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
      ctx.beginPath();
      ctx.arc(cloud.x, cloud.y, cloud.size, 0, Math.PI * 2);
      ctx.arc(cloud.x + cloud.size * 0.5, cloud.y - cloud.size * 0.2, cloud.size * 0.8, 0, Math.PI * 2);
      ctx.fill();
    });
    gameData.current.clouds = gameData.current.clouds.filter(c => c.x + c.size * 2 > 0);

    // Ground
    const groundY = virtualHeight - 60;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, groundY);
    ctx.lineTo(virtualWidth, groundY);
    ctx.stroke();

    // Ground details (scrolling)
    gameData.current.groundOffset = (gameData.current.groundOffset + gameData.current.speed) % 100;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
    for (let i = -100; i < virtualWidth; i += 100) {
      ctx.fillRect(i - gameData.current.groundOffset + 20, groundY + 10, 30, 2);
      ctx.fillRect(i - gameData.current.groundOffset + 60, groundY + 25, 15, 2);
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
        x: virtualWidth,
        y: groundY - (type === 'tree' ? 50 : 30),
        width: type === 'tree' ? 40 : 30,
        height: type === 'tree' ? 50 : 30,
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

  const startGame = () => {
    const canvas = canvasRef.current;
    const groundY = (canvas?.height || 600) - 60;
    gameData.current = {
      dino: { x: 100, y: groundY - 60, width: 60, height: 60, dy: 0, jumpForce: DINO_CONFIG[dinoType].jump, gravity: 0.6, isJumping: false },
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
              <div className="w-1.5 h-1.5 sm:w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[8px] sm:text-[10px] text-white/40 uppercase tracking-widest font-bold">Live Session</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4 sm:gap-8 pointer-events-auto">
          <div className="text-right relative">
            <div className="text-[8px] sm:text-[10px] text-white/40 uppercase tracking-widest font-bold mb-0.5 sm:mb-1">
              {lang === 'zh' ? '当前积分' : 'Current Score'}
            </div>
            <div className="text-xl sm:text-3xl font-mono text-emerald-400 font-black tracking-tighter">{score}</div>
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
            className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm z-10 p-6 text-center"
          >
            <motion.div 
              animate={{ y: [0, -20, 0] }}
              transition={{ repeat: Infinity, duration: 2 }}
              className="w-20 h-20 sm:w-24 sm:h-24 rounded-3xl bg-white/10 border border-white/20 flex items-center justify-center mb-6 sm:mb-8 shadow-2xl"
            >
              <Play className="w-10 h-10 sm:w-12 sm:h-12 text-white fill-white" />
            </motion.div>
            <h2 className="text-4xl sm:text-5xl font-black text-white mb-4 tracking-tighter">准备好了吗？</h2>
            <p className="text-emerald-400 text-lg sm:text-xl mb-2 font-bold animate-pulse">
              {lang === 'zh' ? '目标：获得 62 分' : 'Goal: Get 62 Points'}
            </p>
            <p className="text-white/40 text-base sm:text-lg mb-8 sm:mb-10 font-medium">点击屏幕或按 <span className="px-2 py-1 bg-white/10 rounded border border-white/10 text-white">空格键</span> 开始</p>
            <button 
              onClick={startGame}
              className="px-10 py-3 sm:px-12 sm:py-4 bg-white text-black font-black text-lg sm:text-xl rounded-2xl hover:bg-zinc-200 transition-all active:scale-95 shadow-[0_0_40px_rgba(255,255,255,0.2)]"
            >
              开始游戏
            </button>
          </motion.div>
        )}

        {gameState === 'gameover' && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 flex flex-col items-center justify-center bg-red-500/10 backdrop-blur-md z-10 p-6 text-center"
          >
            <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-3xl bg-red-500/20 border border-red-500/30 flex items-center justify-center mb-6 sm:mb-8">
              <RefreshCw className="w-10 h-10 sm:w-12 sm:h-12 text-red-500" />
            </div>
            <h2 className="text-4xl sm:text-6xl font-black text-white mb-4 tracking-tighter uppercase">Game Over</h2>
            <p className="text-white/60 text-lg sm:text-xl mb-8 sm:mb-10">
              {lang === 'zh' ? `获得了 ${score} 分，再接再厉！` : `Obtained ${score} points, keep it up!`}
            </p>
            <button 
              onClick={startGame}
              className="px-10 py-3 sm:px-12 sm:py-4 bg-white text-black font-black text-lg sm:text-xl rounded-2xl hover:bg-zinc-200 transition-all active:scale-95 shadow-[0_0_40px_rgba(255,255,255,0.2)]"
            >
              重新开始
            </button>
          </motion.div>
        )}

        {gameState === 'easteregg' && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-[#001f3f] via-[#0074D9] to-[#2ECC40] z-[999999] overflow-hidden p-4"
          >
            {/* Back Button in Top Left */}
            <div className="absolute top-4 left-4 sm:top-8 sm:left-8 z-[1000000]">
              <button 
                onClick={onClose}
                className="p-3 sm:p-4 bg-white/10 hover:bg-white/20 backdrop-blur-md border border-white/20 rounded-2xl transition-all active:scale-95 group"
              >
                <X className="w-6 h-6 sm:w-8 sm:h-8 text-white group-hover:rotate-90 transition-transform" />
              </button>
            </div>

            {/* Individual Barrage / Danmaku - Top Area (35% height) */}
            <div className="absolute top-0 left-0 right-0 h-[35%] pointer-events-none overflow-hidden">
              {CLASS_MEMBERS.map((name, i) => {
                // Increase lanes to 18 to reduce density per lane
                const laneCount = 18;
                const lane = i % laneCount;
                const rowHeight = 100 / laneCount;
                // Stagger delays more aggressively to prevent overlap within the same lane
                // Each name in the same lane starts at least 8 seconds apart
                const baseDelay = (Math.floor(i / laneCount) * 8) + (lane * 0.5);
                return (
                  <motion.div
                    key={`top-${i}`}
                    initial={{ x: '120vw' }}
                    animate={{ x: '-120vw' }}
                    transition={{
                      duration: 18 + Math.random() * 12,
                      repeat: Infinity,
                      ease: "linear",
                      delay: baseDelay + Math.random() * 4
                    }}
                    className="absolute whitespace-nowrap text-white/40 font-black text-xl sm:text-3xl tracking-widest italic drop-shadow-lg"
                    style={{ top: `${lane * rowHeight + (Math.random() * 1.5)}%` }}
                  >
                    {name}
                  </motion.div>
                );
              })}
            </div>

            {/* Individual Barrage / Danmaku - Bottom Area (30% height) */}
            <div className="absolute bottom-0 left-0 right-0 h-[30%] pointer-events-none overflow-hidden">
              {CLASS_MEMBERS.slice().reverse().map((name, i) => {
                // Increase lanes to 15
                const laneCount = 15;
                const lane = i % laneCount;
                const rowHeight = 100 / laneCount;
                const baseDelay = (Math.floor(i / laneCount) * 10) + (lane * 0.7);
                return (
                  <motion.div
                    key={`bottom-${i}`}
                    initial={{ x: '120vw' }}
                    animate={{ x: '-120vw' }}
                    transition={{
                      duration: 22 + Math.random() * 15,
                      repeat: Infinity,
                      ease: "linear",
                      delay: baseDelay + Math.random() * 6
                    }}
                    className="absolute whitespace-nowrap text-white/30 font-black text-lg sm:text-2xl tracking-widest italic drop-shadow-md"
                    style={{ top: `${lane * rowHeight + (Math.random() * 2)}%` }}
                  >
                    {name}
                  </motion.div>
                );
              })}
            </div>

            <div className="relative z-10 flex flex-col items-center max-w-6xl w-full px-4 sm:px-8 overflow-y-auto max-h-full py-8 sm:py-12 hide-scrollbar">
              <motion.div
                initial={{ y: 50, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.2 }}
                className="mb-4 sm:mb-10 text-center"
              >
                <h2 className="text-4xl sm:text-6xl md:text-8xl lg:text-9xl font-black text-white tracking-tighter italic drop-shadow-[0_15px_40px_rgba(0,0,0,0.6)] px-4">
                  2021级贯通班
                </h2>
                <div className="h-1 sm:h-2.5 w-full bg-gradient-to-r from-transparent via-white to-transparent mt-3 sm:mt-6 opacity-60" />
              </motion.div>

              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.4, type: "spring", damping: 15 }}
                className="w-full max-w-4xl aspect-video bg-black/40 rounded-[1.5rem] sm:rounded-[4rem] overflow-hidden border-2 sm:border-8 border-white/20 shadow-[0_50px_120px_rgba(0,0,0,0.7)] relative group"
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

              <motion.div
                initial={{ y: 30, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.6 }}
                className="mt-8 sm:mt-16 flex flex-col items-center w-full"
              >
                <div className="flex flex-col sm:flex-row gap-4 sm:gap-12 w-full sm:w-auto px-4 sm:px-0">
                  <button 
                    onClick={startGame}
                    className="px-8 py-3 sm:px-16 sm:py-6 bg-white/10 hover:bg-white/20 backdrop-blur-xl border-2 border-white/30 text-white font-black text-lg sm:text-3xl rounded-[1rem] sm:rounded-[2rem] transition-all active:scale-95 shadow-2xl"
                  >
                    再玩一次
                  </button>
                  <button 
                    onClick={onClose}
                    className="px-8 py-3 sm:px-16 sm:py-6 bg-white text-[#001f3f] font-black text-lg sm:text-3xl rounded-[1rem] sm:rounded-[2rem] transition-all active:scale-95 shadow-[0_25px_60px_rgba(255,255,255,0.4)]"
                  >
                    毕业快乐
                  </button>
                </div>
                <p className="mt-8 sm:mt-16 text-white/50 text-[10px] sm:text-base font-black uppercase tracking-[0.2em] sm:tracking-[0.8em] italic text-center px-4">
                  致 2021级贯通班 全体同学 • 永远的 casino 帮
                </p>
              </motion.div>
            </div>

            {/* Decorative Ambient Glows */}
            <div className="absolute -bottom-40 -left-40 w-[600px] h-[600px] bg-emerald-400/30 rounded-full blur-[150px] animate-pulse" />
            <div className="absolute -top-40 -right-40 w-[600px] h-[600px] bg-blue-400/30 rounded-full blur-[150px] animate-pulse" style={{ animationDelay: '1s' }} />
          </motion.div>
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
