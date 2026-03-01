import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { evaluate } from 'mathjs';

interface GraphViewProps {
  functions: { expression: string; color: string }[];
  parameters?: Record<string, { value: number }>;
}

const GraphView: React.FC<GraphViewProps> = ({ functions, parameters = {} }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const transformRef = useRef(d3.zoomIdentity);

  // Handle Resize
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      if (!entries[0]) return;
      const { width, height } = entries[0].contentRect;
      setDimensions({ width, height });
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!svgRef.current || dimensions.width === 0 || dimensions.height === 0) return;

    const { width, height } = dimensions;
    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const g = svg.append("g");

    // Ensure 1:1 aspect ratio: 1 unit in X = 1 unit in Y in pixels
    const unitsToShowV = 20;
    const pixelsPerUnit = height / unitsToShowV;
    const unitsToShowH = width / pixelsPerUnit;

    const xScaleOrig = d3.scaleLinear()
      .domain([-unitsToShowH / 2, unitsToShowH / 2])
      .range([0, width]);

    const yScaleOrig = d3.scaleLinear()
      .domain([-unitsToShowV / 2, unitsToShowV / 2])
      .range([height, 0]);

    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.01, 1000])
      .on("zoom", (event) => {
        transformRef.current = event.transform;
        update(event.transform);
      });

    svg.call(zoom).call(zoom.transform, transformRef.current);

    function update(t: d3.ZoomTransform) {
      g.selectAll("*").remove();

      const xScale = t.rescaleX(xScaleOrig);
      const yScale = t.rescaleY(yScaleOrig);

      const xDomain = xScale.domain();
      const yDomain = yScale.domain();

      // Dynamic Grid Step
      const targetPixels = 60;
      const roughStep = targetPixels / (pixelsPerUnit * t.k);
      
      const p10 = Math.pow(10, Math.floor(Math.log10(roughStep)));
      const norm = roughStep / p10;
      let step;
      if (norm < 1.5) step = 1 * p10;
      else if (norm < 3.5) step = 2 * p10;
      else if (norm < 7.5) step = 5 * p10;
      else step = 10 * p10;

      const xTicks = d3.range(Math.ceil(xDomain[0] / step) * step, xDomain[1] + step/2, step);
      const yTicks = d3.range(Math.ceil(yDomain[0] / step) * step, yDomain[1] + step/2, step);

      // Grid lines - Dark mode: subtle white
      g.append("g")
        .selectAll("line.vertical")
        .data(xTicks)
        .enter().append("line")
        .attr("x1", d => xScale(d))
        .attr("x2", d => xScale(d))
        .attr("y1", 0)
        .attr("y2", height)
        .attr("stroke", "rgba(255,255,255,0.05)")
        .attr("stroke-width", 1);

      g.append("g")
        .selectAll("line.horizontal")
        .data(yTicks)
        .enter().append("line")
        .attr("y1", d => yScale(d))
        .attr("y2", d => yScale(d))
        .attr("x1", 0)
        .attr("x2", width)
        .attr("stroke", "rgba(255,255,255,0.05)")
        .attr("stroke-width", 1);

      // Axes
      const format = (d: number) => {
        if (Math.abs(d) < 1e-10) return "0";
        return d3.format(".4~g")(d);
      };

      const xAxis = d3.axisBottom(xScale)
        .tickValues(xTicks.filter(t => Math.abs(t) > 1e-10))
        .tickFormat(d => format(d as number));
      
      const yAxis = d3.axisLeft(yScale)
        .tickValues(yTicks.filter(t => Math.abs(t) > 1e-10))
        .tickFormat(d => format(d as number));

      // X Axis line and labels - Dark mode: zinc-600
      const xAxisG = g.append("g")
        .attr("transform", `translate(0, ${Math.max(0, Math.min(height, yScale(0)))})`)
        .call(xAxis);
      
      xAxisG.select(".domain").attr("stroke", "#52525b").attr("stroke-width", 2);
      xAxisG.selectAll(".tick text").attr("fill", "#71717a").style("font-size", "10px");

      // Y Axis line and labels
      const yAxisG = g.append("g")
        .attr("transform", `translate(${Math.max(0, Math.min(width, xScale(0)))}, 0)`)
        .call(yAxis);

      yAxisG.select(".domain").attr("stroke", "#52525b").attr("stroke-width", 2);
      yAxisG.selectAll(".tick text").attr("fill", "#71717a").style("font-size", "10px");

      // Origin dot
      g.append("circle")
        .attr("cx", xScale(0))
        .attr("cy", yScale(0))
        .attr("r", 3)
        .attr("fill", "#71717a");

      // Plot functions
      functions.forEach(({ expression, color }) => {
        if (!expression) return;

        const MAX_PIXEL = 50000;
        const line = d3.line<[number, number]>()
          .x(d => {
            const px = xScale(d[0]);
            return Math.max(-MAX_PIXEL, Math.min(width + MAX_PIXEL, px));
          })
          .y(d => {
            const py = yScale(d[1]);
            return Math.max(-MAX_PIXEL, Math.min(height + MAX_PIXEL, py));
          })
          .defined(d => !isNaN(d[1]) && isFinite(d[1]));

        const points: [number, number][] = [];
        const samples = 1000;
        const dx = (xDomain[1] - xDomain[0]) / samples;
        
        let normalizedExpr = expression
          .replace(/f\(x\)\s*=/g, '')
          .replace(/y\s*=/g, '')
          .replace(/sin\^-1/gi, 'asin')
          .replace(/cos\^-1/gi, 'acos')
          .replace(/tan\^-1/gi, 'atan')
          .replace(/log2\(([^)]+)\)/gi, 'log($1, 2)')
          .replace(/log10\(([^)]+)\)/gi, 'log($1, 10)')
          .replace(/π/gi, 'PI')
          .trim();

        // Handle implicit multiplication like kx -> k * x
        const splitImplicitMultiplication = (expr: string) => {
          const functions = ['sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'log', 'ln', 'sqrt', 'abs', 'exp', 'pi', 'phi'];
          let processed = expr;
          const placeholders: string[] = [];
          const sortedFns = [...functions].sort((a, b) => b.length - a.length);
          sortedFns.forEach((fn, i) => {
            const placeholder = `__FN${i}__`;
            processed = processed.replace(new RegExp(fn, 'gi'), placeholder);
            placeholders[i] = fn;
          });
          processed = processed.replace(/([a-z])([a-z])/gi, '$1 $2');
          processed = processed.replace(/([a-z])([a-z])/gi, '$1 $2');
          sortedFns.forEach((fn, i) => {
            processed = processed.replace(new RegExp(`__FN${i}__`, 'g'), fn);
          });
          return processed;
        };

        normalizedExpr = splitImplicitMultiplication(normalizedExpr);

        for (let x = xDomain[0]; x <= xDomain[1]; x += dx) {
          try {
            const scope: any = { x, pi: Math.PI, e: Math.E, ans: 0 };
            Object.keys(parameters).forEach(key => {
              scope[key] = parameters[key].value;
            });

            let y;
            try {
              y = evaluate(normalizedExpr, scope);
              if (y && typeof y === 'object' && 're' in y) {
                y = Math.abs(y.im) < 1e-10 ? y.re : NaN;
              }
            } catch (err: any) {
              if (err.message && err.message.includes('Undefined symbol')) {
                const match = err.message.match(/Undefined symbol (\w+)/);
                if (match && match[1]) {
                  scope[match[1]] = 1;
                  y = evaluate(normalizedExpr, scope);
                } else throw err;
              } else throw err;
            }
            
            if (typeof y === 'number') {
              if (y === Infinity) y = 1e100;
              if (y === -Infinity) y = -1e100;
            }
            
            points.push([x, typeof y === 'number' ? y : NaN]);
          } catch (e) {
            points.push([x, NaN]);
          }
        }

        g.append("path")
          .datum(points)
          .attr("fill", "none")
          .attr("stroke", color)
          .attr("stroke-width", 2.5)
          .attr("stroke-linecap", "round")
          .attr("stroke-linejoin", "round")
          .attr("d", line);
      });
    }

    update(transformRef.current);

  }, [functions, dimensions, parameters]);

  const resetView = () => {
    if (!svgRef.current) return;
    d3.select(svgRef.current)
      .transition()
      .duration(500)
      .call(d3.zoom().transform as any, d3.zoomIdentity);
  };

  return (
    <div ref={containerRef} className="w-full h-full bg-zinc-950 rounded-2xl shadow-inner overflow-hidden border border-white/10 cursor-crosshair relative">
      <svg ref={svgRef} className="w-full h-full" />
      <div className="absolute bottom-4 right-4 flex flex-col gap-2">
        <button 
          onClick={resetView}
          className="bg-zinc-900/90 backdrop-blur p-2.5 rounded-xl shadow-lg border border-white/10 text-zinc-400 hover:bg-zinc-800 hover:text-white transition-all active:scale-95"
          title="Reset View"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
        </button>
      </div>
    </div>
  );
};

export default GraphView;
