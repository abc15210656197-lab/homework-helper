import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { evaluate, compile } from 'mathjs';
import { Save, RotateCcw } from 'lucide-react';

interface GraphViewProps {
  functions: { expression: string; color: string }[];
  parameters?: Record<string, { value: number }>;
  onSave?: () => void;
}

const GraphView: React.FC<GraphViewProps> = ({ functions, parameters = {}, onSave }) => {
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
      functions.forEach(({ expression, color }, index) => {
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

        // Handle implicit multiplication like kx -> k * x
        const splitImplicitMultiplication = (expr: string) => {
          const functions = ['sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'log', 'ln', 'sqrt', 'abs', 'exp', 'pi', 'phi'];
          let processed = expr;
          const placeholders: string[] = [];
          const sortedFns = [...functions].sort((a, b) => b.length - a.length);
          sortedFns.forEach((fn, i) => {
            const placeholder = ` \uE000${i}\uE000 `;
            processed = processed.replace(new RegExp(fn, 'gi'), placeholder);
            placeholders[i] = fn;
          });
          processed = processed.replace(/([a-z])([a-z])/gi, '$1 $2');
          processed = processed.replace(/([a-z])([a-z])/gi, '$1 $2');
          sortedFns.forEach((fn, i) => {
            processed = processed.replace(new RegExp(` \\uE000${i}\\uE000 `, 'g'), fn);
          });
          return processed;
        };

        normalizedExpr = splitImplicitMultiplication(normalizedExpr);

        if (normalizedExpr.includes('=')) {
          const parts = normalizedExpr.split('=');
          if (parts.length === 2) {
            const implicitExpr = `(${parts[0]}) - (${parts[1]})`;
            
            const resX = 150;
            const resY = 150;
            const dxGrid = (xDomain[1] - xDomain[0]) / resX;
            const dyGrid = (yDomain[1] - yDomain[0]) / resY;
            
            const values = new Array(resX * resY);
            let minVal = Infinity;
            let maxVal = -Infinity;
            
            let compiled;
            try {
              compiled = compile(implicitExpr);
            } catch (e) {
              return;
            }
            
            for (let j = 0; j < resY; j++) {
              const y = yDomain[1] - j * dyGrid;
              for (let i = 0; i < resX; i++) {
                const x = xDomain[0] + i * dxGrid;
                const scope: any = { x, y, pi: Math.PI, e: Math.E };
                Object.keys(parameters).forEach(key => {
                  scope[key] = parameters[key].value;
                });
                try {
                  let val = compiled.evaluate(scope);
                  if (val && typeof val === 'object' && 're' in val) {
                    val = Math.abs(val.im) < 1e-10 ? val.re : NaN;
                  }
                  values[j * resX + i] = typeof val === 'number' ? val : NaN;
                  if (!isNaN(val)) {
                    if (val < minVal) minVal = val;
                    if (val > maxVal) maxVal = val;
                  }
                } catch (e) {
                  values[j * resX + i] = NaN;
                }
              }
            }

            // Asymptote filtering
            const evaluateAt = (i: number, j: number) => {
              const x = xDomain[0] + i * dxGrid;
              const y = yDomain[1] - j * dyGrid;
              const scope: any = { x, y, pi: Math.PI, e: Math.E };
              Object.keys(parameters).forEach(key => { scope[key] = parameters[key].value; });
              try {
                let val = compiled.evaluate(scope);
                if (val && typeof val === 'object' && 're' in val) {
                  val = Math.abs(val.im) < 1e-10 ? val.re : NaN;
                }
                return typeof val === 'number' ? val : NaN;
              } catch (e) {
                return NaN;
              }
            };

            for (let j = 0; j < resY; j++) {
              for (let i = 0; i < resX; i++) {
                const idx = j * resX + i;
                const v1 = values[idx];
                if (isNaN(v1)) continue;

                // Check right edge
                if (i < resX - 1) {
                  const v2 = values[idx + 1];
                  if (!isNaN(v2) && v1 * v2 < 0) {
                    // Sub-sample the cell edge to detect poles (asymptotes)
                    const s1 = evaluateAt(i + 0.25, j);
                    const s2 = evaluateAt(i + 0.5, j);
                    const s3 = evaluateAt(i + 0.75, j);
                    const maxEdgeVal = Math.max(Math.abs(v1), Math.abs(v2));
                    const maxSampleVal = Math.max(
                      isNaN(s1) ? Infinity : Math.abs(s1),
                      isNaN(s2) ? Infinity : Math.abs(s2),
                      isNaN(s3) ? Infinity : Math.abs(s3)
                    );
                    
                    // If any sample is significantly larger than the edge values, it's a pole
                    if (maxSampleVal > Math.max(10, maxEdgeVal * 2)) {
                      values[idx] = NaN;
                      values[idx + 1] = NaN;
                    }
                  }
                }
                
                // Check bottom edge
                if (j < resY - 1) {
                  const v3 = values[idx + resX];
                  if (!isNaN(v3) && v1 * v3 < 0) {
                    const s1 = evaluateAt(i, j + 0.25);
                    const s2 = evaluateAt(i, j + 0.5);
                    const s3 = evaluateAt(i, j + 0.75);
                    const maxEdgeVal = Math.max(Math.abs(v1), Math.abs(v3));
                    const maxSampleVal = Math.max(
                      isNaN(s1) ? Infinity : Math.abs(s1),
                      isNaN(s2) ? Infinity : Math.abs(s2),
                      isNaN(s3) ? Infinity : Math.abs(s3)
                    );
                    
                    if (maxSampleVal > Math.max(10, maxEdgeVal * 2)) {
                      values[idx] = NaN;
                      values[idx + resX] = NaN;
                    }
                  }
                }
              }
            }
            
            if (minVal <= 0 && maxVal >= 0) {
              const contours = d3.contours()
                .size([resX, resY])
                .thresholds([0])
                (values);
                
              const lineStrings: number[][][] = [];
              contours.forEach(contour => {
                if (contour.type === 'MultiPolygon') {
                  contour.coordinates.forEach(polygon => {
                    polygon.forEach(ring => {
                      let currentLine: number[][] = [];
                      ring.forEach(pt => {
                        const x = xDomain[0] + pt[0] * dxGrid;
                        const y = yDomain[1] - pt[1] * dyGrid;
                        const scope: any = { x, y, pi: Math.PI, e: Math.E };
                        Object.keys(parameters).forEach(key => { scope[key] = parameters[key].value; });
                        let val: any = NaN;
                        try {
                          val = compiled.evaluate(scope);
                          if (val && typeof val === 'object' && 're' in val) {
                            val = Math.abs(val.im) < 1e-10 ? val.re : NaN;
                          }
                        } catch (e) {}
                        
                        const i0 = Math.floor(pt[0]);
                        const i1 = Math.ceil(pt[0]);
                        const j0 = Math.floor(pt[1]);
                        const j1 = Math.ceil(pt[1]);
                        const v00 = values[j0 * resX + i0];
                        const v01 = values[j0 * resX + i1];
                        const v10 = values[j1 * resX + i0];
                        const v11 = values[j1 * resX + i1];
                        
                        let isAsymptote = false;
                        if (isNaN(v00) || isNaN(v01) || isNaN(v10) || isNaN(v11)) {
                          isAsymptote = true;
                        } else if (typeof val === 'number' && !isNaN(val)) {
                           // If the value is large, it might be an asymptote or just a steep curve.
                           // To distinguish, we check if the function actually crosses 0 smoothly.
                           // An asymptote jumps from -inf to +inf, so the gradient is massive.
                           // We can check the values at the corners of the cell.
                           const maxCornerVal = Math.max(Math.abs(v00), Math.abs(v01), Math.abs(v10), Math.abs(v11));
                           
                           // If the true value at the interpolated root is larger than the corner values,
                           // it means the interpolation is wildly wrong, which happens at asymptotes.
                           if (Math.abs(val) > Math.max(5, maxCornerVal)) {
                             isAsymptote = true;
                           }
                        } else {
                           isAsymptote = true; // NaN means undefined, likely asymptote
                        }

                        if (!isAsymptote) {
                          currentLine.push(pt);
                        } else {
                          if (currentLine.length > 1) {
                            lineStrings.push(currentLine);
                          }
                          currentLine = [];
                        }
                      });
                      if (currentLine.length > 1) {
                        lineStrings.push(currentLine);
                      }
                    });
                  });
                }
              });

              const multiLineString = {
                type: 'MultiLineString',
                coordinates: lineStrings
              };
                
              const transform = d3.geoTransform({
                point: function(x, y) {
                  const px = xScale(xDomain[0] + x * dxGrid);
                  const py = yScale(yDomain[1] - y * dyGrid);
                  this.stream.point(px, py);
                }
              });
              
              const path = d3.geoPath().projection(transform);
              
              g.selectAll(`path.implicit-${index}`)
                .data([multiLineString])
                .enter()
                .append("path")
                .attr("class", `implicit-${index}`)
                .attr("fill", "none")
                .attr("stroke", color)
                .attr("stroke-width", 2.5)
                .attr("stroke-linecap", "round")
                .attr("stroke-linejoin", "round")
                .attr("d", path as any);
            }
            return;
          }
        }

        let prevY = NaN;
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
              
              if (!isNaN(prevY)) {
                const dy = y - prevY;
                const height = yDomain[1] - yDomain[0];
                // Check for large jumps OR sign changes (potential asymptotes)
                if (Math.abs(dy) > height * 0.3 || (y * prevY < 0)) {
                  try {
                    const midScope = { ...scope, x: x - dx / 2 };
                    let midY = evaluate(normalizedExpr, midScope);
                    if (midY && typeof midY === 'object' && 're' in midY) {
                      midY = Math.abs(midY.im) < 1e-10 ? midY.re : NaN;
                    }
                    if (typeof midY === 'number') {
                      if (midY === Infinity) midY = 1e100;
                      if (midY === -Infinity) midY = -1e100;
                      
                      const expectedY = (prevY + y) / 2;
                      // If the actual midpoint deviates from the linear interpolation by more than a threshold,
                      // or if it's a huge jump crossing zero, it's an asymptote.
                      // For sign changes (roots vs asymptotes), a root is linear-ish, an asymptote is not.
                      const deviation = Math.abs(midY - expectedY);
                      const threshold = Math.max(Math.abs(dy) * 0.1, height * 0.05);
                      
                      if (isNaN(midY) || deviation > threshold) {
                        points.push([x - dx / 2, NaN]);
                      }
                    } else {
                      points.push([x - dx / 2, NaN]);
                    }
                  } catch (e) {
                    points.push([x - dx / 2, NaN]);
                  }
                }
              }
            }
            
            points.push([x, typeof y === 'number' ? y : NaN]);
            prevY = typeof y === 'number' ? y : NaN;
          } catch (e) {
            points.push([x, NaN]);
            prevY = NaN;
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
        {onSave && (
          <button 
            onClick={onSave}
            className="bg-zinc-900/90 backdrop-blur p-2.5 rounded-xl shadow-lg border border-white/10 text-zinc-400 hover:bg-zinc-800 hover:text-white transition-all active:scale-95"
            title="Save to History"
          >
            <Save className="w-5 h-5" />
          </button>
        )}
        <button 
          onClick={resetView}
          className="bg-zinc-900/90 backdrop-blur p-2.5 rounded-xl shadow-lg border border-white/10 text-zinc-400 hover:bg-zinc-800 hover:text-white transition-all active:scale-95"
          title="Reset View"
        >
          <RotateCcw className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
};

export default GraphView;
