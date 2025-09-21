// ParticleBackground.jsx
import React, { useEffect, useRef } from 'react';

const ParticleBackground = () => {
  const canvasRef = useRef(null);
  const animationFrameId = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }

    let particles = [];
    const maxParticles = 90;
    const lineDistance = 100;

    const getParticleProperties = () => {
      return {
        speed: 0.75,
        radius: 1.5,
        maxLines: 4,
      };
    };

    class Particle {
      constructor(x, y, properties) {
        this.x = x;
        this.y = y;
        this.radius = properties.radius;
        this.speed = properties.speed;
        this.vx = (Math.random() - 0.5) * this.speed * 2;
        this.vy = (Math.random() - 0.5) * this.speed * 2;
      }

      update() {
        this.x += this.vx;
        this.y += this.vy;

        if (this.x - this.radius < 0 || this.x + this.radius > canvas.width) {
          this.vx *= -1;
        }
        if (this.y - this.radius < 0 || this.y + this.radius > canvas.height) {
          this.vy *= -1;
        }
      }

      draw() {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(99, 175, 206, 0.8)';
        ctx.fill();
        ctx.closePath();
      }
    }

    const initParticles = () => {
      particles = [];
      const properties = getParticleProperties();
      for (let i = 0; i < maxParticles; i++) {
        const x = Math.random() * canvas.width;
        const y = Math.random() * canvas.height;
        particles.push(new Particle(x, y, properties));
      }
    };

    const drawLines = () => {
      const properties = getParticleProperties();
      for (let i = 0; i < particles.length; i++) {
        let linesDrawn = 0;
        for (let j = i + 1; j < particles.length; j++) {
          if (linesDrawn >= properties.maxLines) break;

          const p1 = particles[i];
          const p2 = particles[j];
          const distance = Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));

          if (distance < lineDistance) {
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.strokeStyle = `rgba(99, 175, 206, ${1 - (distance / lineDistance)})`;
            ctx.lineWidth = 0.5;
            ctx.stroke();
            ctx.closePath();
            linesDrawn++;
          }
        }
      }
    };

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particles.forEach(p => {
        p.update();
        p.draw();
      });
      drawLines();
      animationFrameId.current = requestAnimationFrame(animate);
    };

    const handleResize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      initParticles();
    };

    handleResize();
    initParticles();

    window.addEventListener('resize', handleResize);

    animate();

    return () => {
      window.removeEventListener('resize', handleResize);
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 w-full h-full bg-transparent"
      style={{ zIndex: -2 }}
    ></canvas>
  );
};

export default ParticleBackground;
