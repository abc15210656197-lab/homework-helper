import React, { useRef, useEffect } from 'react';
import { motion } from 'framer-motion';

export function BackgroundLines() {
  const verticalLines = [
    { left: '15%', duration: 7, delay: 0 },
    { left: '35%', duration: 9, delay: 2 },
    { left: '55%', duration: 6, delay: 1 },
    { left: '75%', duration: 8, delay: 3 },
    { left: '95%', duration: 10, delay: 0.5 },
  ];

  const horizontalLines = [
    { top: '15%', duration: 8, delay: 1 },
    { top: '45%', duration: 10, delay: 3 },
    { top: '75%', duration: 7, delay: 0 },
  ];

  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
      {verticalLines.map((line, i) => (
        <motion.div
          key={`v-${i}`}
          className="absolute w-[1px] h-[30vh] bg-gradient-to-b from-transparent via-white to-transparent shadow-[0_0_20px_rgba(255,255,255,0.5)]"
          style={{ left: line.left, top: '-30vh' }}
          animate={{ top: '130vh' }}
          transition={{ duration: line.duration, repeat: Infinity, ease: "linear", delay: line.delay }}
        />
      ))}
      {horizontalLines.map((line, i) => (
        <motion.div
          key={`h-${i}`}
          className="absolute h-[1px] w-[30vw] bg-gradient-to-r from-transparent via-white to-transparent shadow-[0_0_20px_rgba(255,255,255,0.5)]"
          style={{ top: line.top, left: '-30vw' }}
          animate={{ left: '130vw' }}
          transition={{ duration: line.duration, repeat: Infinity, ease: "linear", delay: line.delay }}
        />
      ))}
    </div>
  );
}

export function BackgroundBubbles() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width = window.innerWidth;
    let height = window.innerHeight;
    canvas.width = width;
    canvas.height = height;

    const bubbles: { 
      x: number, 
      y: number, 
      vx: number, 
      vy: number, 
      radiusX: number, 
      radiusY: number, 
      rotation: number,
      rotationSpeed: number,
      opacity: number 
    }[] = [];
    const numBubbles = 15;

    for (let i = 0; i < numBubbles; i++) {
      const radiusX = Math.random() * 50 + 30;
      bubbles.push({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        radiusX: radiusX,
        radiusY: radiusX * (Math.random() * 0.4 + 0.6), // Random aspect ratio
        rotation: Math.random() * Math.PI * 2,
        rotationSpeed: (Math.random() - 0.5) * 0.01,
        opacity: Math.random() * 0.12 + 0.08
      });
    }

    let animationFrameId: number;

    const render = () => {
      ctx.clearRect(0, 0, width, height);

      for (let i = 0; i < numBubbles; i++) {
        const b = bubbles[i];
        b.x += b.vx;
        b.y += b.vy;
        b.rotation += b.rotationSpeed;

        const maxRadius = Math.max(b.radiusX, b.radiusY);
        if (b.x + maxRadius < 0) b.x = width + maxRadius;
        if (b.x - maxRadius > width) b.x = -maxRadius;
        if (b.y + maxRadius < 0) b.y = height + maxRadius;
        if (b.y - maxRadius > height) b.y = -maxRadius;

        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.rotate(b.rotation);

        const gradient = ctx.createRadialGradient(0, 0, maxRadius * 0.1, 0, 0, maxRadius);
        gradient.addColorStop(0, `rgba(255, 255, 255, ${b.opacity})`);
        gradient.addColorStop(0.7, `rgba(255, 255, 255, ${b.opacity * 0.4})`);
        gradient.addColorStop(0.9, `rgba(255, 255, 255, ${b.opacity * 0.1})`);
        gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

        ctx.beginPath();
        ctx.ellipse(0, 0, b.radiusX, b.radiusY, 0, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.fill();

        ctx.beginPath();
        ctx.ellipse(0, 0, b.radiusX, b.radiusY, 0, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255, 255, 255, ${b.opacity * 0.2})`;
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.restore();
      }

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    const handleResize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width;
      canvas.height = height;
    };

    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  return <canvas ref={canvasRef} className="fixed inset-0 pointer-events-none z-0" />;
}
