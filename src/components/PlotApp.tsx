"use client";

import React, { useState, useRef, useEffect } from 'react';
import { UploadCloud, Download, Settings, FileText, ChevronRight, BarChart3, Info, Pipette, X } from 'lucide-react';
import * as d3 from 'd3';
import Papa from 'papaparse';
import { toPng } from 'html-to-image';
import { z } from 'zod';

const csvRowSchema = z.object({
  beta: z.any(),
  se: z.any(),
  pval: z.any(),
}).passthrough();

export default function PlotApp() {
  const [file, setFile] = useState<File | null>(null);
  const [data, setData] = useState<any[] | null>(null);
  const [selectedBatch, setSelectedBatch] = useState<string>('all');
  const [groupFilter, setGroupFilter] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [guidance, setGuidance] = useState('');
  const [params, setParams] = useState({
    confidenceLevel: 95,
    markerSize: 5,
    lineColor: '#84cc16', // Tailwind lime-500
    xAxisDataset: 'beta',
    yAxisDataset: 'plot_trait',
    groupBy: '',
    displayColumns: [
      { id: 'n', key: 'N', label: 'N', show: true, decimals: 3 },
      { id: 'pval', key: 'pval', label: 'pval', show: true, decimals: 2 },
      { id: 'or', key: 'OR', label: 'OR (95% CI)', show: true, decimals: 2 }
    ],
    showTitle: true,
    showDescription: true,
    showSeparator: true,
    showGroupLabels: false,
    groupLabelSize: 24,
    groupLabelColor: '#000000',
    groupLabelBold: true,
    groupLabelItalic: false,
    groupLabelUnderline: true,
    xAxisTickStep: 1,
    canvasPadding: 6,
    yAxisTextSize: 22,
    yAxisTextColor: '#1e293b',
    title: 'Beta/log-odds',
    description: '',
    titleColor: '#000000',
    descColor: '#334155',
    titleSize: 30,
    descSize: 21,
    separatorSize: 1.5,
    separatorStyle: 'solid'
  });

  const plotRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const [activeStyleRow, setActiveStyleRow] = useState<any | null>(null);
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFile = e.target.files?.[0];
    if (uploadedFile) {
      setFile(uploadedFile);
      setError(null);
      Papa.parse(uploadedFile, {
        header: true,
        dynamicTyping: true,
        skipEmptyLines: 'greedy',
        transformHeader: (header) => header.replace(/^\uFEFF/, '').trim().toLowerCase(),
        complete: (results) => {
          const parsedData = results.data as any[];
          const validationResult = z.array(csvRowSchema).safeParse(parsedData);
          if (validationResult.success) {
            const calculated = validationResult.data
              .filter((row: any) => String(row.batch || '').toLowerCase() !== 'headings')
              .map((row: any) => {
                const beta = parseFloat(row.beta);
                const se = parseFloat(row.se);
                const pval = parseFloat(row.pval);

                if (isNaN(beta) || isNaN(se)) return { ...row, lci: null, uci: null, or: null, or_lci: null, or_uci: null, sig: 'N/A' };

                const lciValue = beta - (1.96 * se);
                const uciValue = beta + (1.96 * se);

                const lci = row.lci !== undefined ? parseFloat(row.lci) : Math.round(lciValue * 1000) / 1000;
                const uci = row.uci !== undefined ? parseFloat(row.uci) : Math.round(uciValue * 1000) / 1000;
                const or = row.or !== undefined ? parseFloat(row.or) : Math.round(Math.exp(beta) * 100) / 100;
                const or_lci = row.or_lci !== undefined ? parseFloat(row.or_lci) : Math.round(Math.exp(lciValue) * 100) / 100;
                const or_uci = row.or_uci !== undefined ? parseFloat(row.or_uci) : Math.round(Math.exp(uciValue) * 100) / 100;
                const sig = (!isNaN(pval) && pval < 0.05) ? 'yes' : 'no';

                return {
                  ...row,
                  lci,
                  uci,
                  or,
                  or_lci,
                  or_uci,
                  sig,
                  hidden: false,
                  style: {
                    markerColor: params.lineColor,
                    markerSize: params.markerSize,
                    labelColor: '#1e293b',
                    labelSize: 22,
                    bold: true,
                    italic: false,
                    underline: false
                  }
                };
              })
              .sort((a: any, b: any) => {
                const aVal = parseFloat(a.order);
                const bVal = parseFloat(b.order);
                if (!isNaN(aVal) && !isNaN(bVal)) return aVal - bVal;
                if (!isNaN(aVal)) return -1;
                if (!isNaN(bVal)) return 1;
                return 0;
              });
            setData(calculated);
            setSelectedBatch('all');
            setError(null);
          } else {
            setData(null);
            const firstError = validationResult.error.issues[0];
            const rowIndex = typeof firstError.path[0] === 'number' ? firstError.path[0] + 1 : firstError.path[0];
            const field = firstError.path[1];
            setError(`Validation Failed: Row ${String(rowIndex)}, Field "${String(field)}" - ${firstError.message}`);
          }
        },
      });
    }
  };

  const downloadImage = () => {
    if (plotRef.current === null) return;

    toPng(plotRef.current, { cacheBust: true, backgroundColor: '#1e293b' })
      .then((dataUrl) => {
        const link = document.createElement('a');
        link.download = 'forest-plot.png';
        link.href = dataUrl;
        link.click();
      })
      .catch((err) => {
        console.error('Error downloading image', err);
      });
  };

  // Basic D3 scatter/forest plot logic placeholder
  useEffect(() => {
    if (!plotRef.current || !data) return;

    // Clear previous plot
    d3.select(plotRef.current).selectAll('*').remove();

    const width = 1500;
    const height = 800;
    const p = params.canvasPadding;

    // Dynamic Bottom Margin & Inner Height
    let marginBottom = 40; // Base space for Axis
    if (params.showTitle) marginBottom += 45;
    if (params.showSeparator) marginBottom += 35;
    if (params.showDescription) marginBottom += 55;

    const margin = {
      top: 10 + p,
      right: 620 + p,
      bottom: marginBottom + p,
      left: 320 + p
    };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    const svg = d3.select(plotRef.current)
      .append('svg')
      .attr('width', '100%')
      .attr('height', '100%')
      .attr('viewBox', `0 0 ${width} ${height}`)
      .style('font-family', "var(--font-inter), sans-serif") // Professional Inter font
      .style('background', '#ffffff'); // pure white background

    const g = svg.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    // Helper function for wrapping text
    const wrap = (text: any, width: number) => {
      text.each(function (this: any) {
        const textElement = d3.select(this);
        const rawText = textElement.text();
        const parts = rawText.includes('<br>') ? rawText.split('<br>') : [rawText];

        textElement.text(null);
        let lineNumber = 0;
        const lineHeight = 1.1; // ems
        const yCoord = textElement.attr("y");
        const dy = parseFloat(textElement.attr("dy") || "0");

        parts.forEach((part) => {
          const words = part.trim().split(/\s+/).reverse();
          let word;
          let line: string[] = [];
          let tspan = textElement.append("tspan").attr("x", -50).attr("y", yCoord).attr("dy", (lineNumber === 0 ? dy : lineHeight) + "em");

          while (word = words.pop()) {
            line.push(word);
            tspan.text(line.join(" "));
            if ((tspan.node() as any).getComputedTextLength() > width) {
              line.pop();
              tspan.text(line.join(" "));
              line = [word];
              tspan = textElement.append("tspan").attr("x", -50).attr("y", yCoord).attr("dy", lineHeight + "em").text(word);
              lineNumber++;
            }
          }
          lineNumber++;
        });
      });
    };

    // Group and Sort data if needed
    let plotData = filteredData!.filter(d =>
      !isNaN(parseFloat(d[params.xAxisDataset])) &&
      d[params.yAxisDataset] !== null &&
      d[params.yAxisDataset] !== undefined
    );

    if (params.groupBy) {
      plotData = [...plotData].sort((a, b) => String(a[params.groupBy] || '').localeCompare(String(b[params.groupBy] || '')));

      if (params.showGroupLabels) {
        const withHeaders: any[] = [];
        let currentGroup = '';
        plotData.forEach((d, i) => {
          const gName = String(d[params.groupBy] || 'None');
          if (gName !== currentGroup) {
            if (i > 0) {
              withHeaders.push({ isSpacer: true, [params.yAxisDataset]: `spacer-${i}` });
            }
            withHeaders.push({ isHeader: true, headerText: gName, [params.yAxisDataset]: gName, batch: d.batch });
            currentGroup = gName;
          }
          withHeaders.push(d);
        });
        plotData = withHeaders;
      }
    }

    plotData = plotData.slice(0, 50); // Increased for headers

    const y = d3.scaleBand()
      .domain(plotData.map((_, i) => i.toString()))
      .range([0, innerHeight])
      .padding(0.4);

    const lciKey = params.xAxisDataset === 'beta' ? 'lci' : (params.xAxisDataset === 'or' ? 'or_lci' : '');
    const uciKey = params.xAxisDataset === 'beta' ? 'uci' : (params.xAxisDataset === 'or' ? 'or_uci' : '');

    const allXValues: number[] = [];
    plotData.forEach(d => {
      const val = parseFloat(d[params.xAxisDataset]);
      if (!isNaN(val)) allXValues.push(val);
      if (lciKey && !isNaN(parseFloat(d[lciKey]))) allXValues.push(parseFloat(d[lciKey]));
      if (uciKey && !isNaN(parseFloat(d[uciKey]))) allXValues.push(parseFloat(d[uciKey]));
    });

    // Ensure the null-line (0 or 1) is always in view
    const refPoint = params.xAxisDataset === 'beta' ? 0 : (params.xAxisDataset === 'or' ? 1 : 0);
    allXValues.push(refPoint);

    const xExtentArr = d3.extent(allXValues) as [number, number];
    const xBuffer = (xExtentArr[1] - xExtentArr[0]) * 0.15;

    const x = d3.scaleLinear()
      .domain([xExtentArr[0] - xBuffer, xExtentArr[1] + xBuffer])
      .range([0, innerWidth])
      .nice();

    // Group backgrounds
    if (params.groupBy) {
      let currentGroup = '';
      let groupStart = 0;
      const groups: { name: string, start: number, count: number }[] = [];

      plotData.forEach((d, i) => {
        const gName = String(d[params.groupBy] || 'None');
        if (gName !== currentGroup) {
          if (currentGroup !== '') {
            groups.push({ name: currentGroup, start: groupStart, count: i - groupStart });
          }
          currentGroup = gName;
          groupStart = i;
        }
        if (i === plotData.length - 1) {
          groups.push({ name: currentGroup, start: groupStart, count: i - groupStart + 1 });
        }
      });

      g.selectAll('.group-bg')
        .data(groups)
        .enter()
        .append('rect')
        .attr('x', -margin.left)
        .attr('y', d => (y(d.start.toString()) || 0))
        .attr('width', width)
        .attr('height', d => d.count * (y.step()))
        .style('fill', (d, i) => i % 2 === 0 ? '#f8fafc' : '#ffffff')
        .style('opacity', 0.8)
        .lower();
    }

    // Null effect line (dotted)
    const nullLineX = params.xAxisDataset === 'beta' ? 0 : (params.xAxisDataset === 'or' ? 1 : 0);
    g.append('line')
      .attr('x1', x(nullLineX))
      .attr('y1', -10)
      .attr('x2', x(nullLineX))
      .attr('y2', innerHeight)
      .style('stroke', '#94a3b8')
      .style('stroke-dasharray', '4,4')
      .style('opacity', 0.8);

    // Confidence intervals (only if using beta/se or similar)
    if (params.xAxisDataset === 'beta' || params.xAxisDataset === 'or') {
      const lciKey = params.xAxisDataset === 'beta' ? 'lci' : 'or_lci';
      const uciKey = params.xAxisDataset === 'beta' ? 'uci' : 'or_uci';

      // CI horizontal line
      g.selectAll('.ci-line')
        .data(plotData.filter(d => !d.isHeader))
        .enter()
        .append('line')
        .attr('x1', d => x(parseFloat(d[lciKey]) || parseFloat(d[params.xAxisDataset])))
        .attr('x2', d => x(parseFloat(d[uciKey]) || parseFloat(d[params.xAxisDataset])))
        .attr('y1', d => (y(plotData.indexOf(d).toString()) || 0) + y.bandwidth() / 2)
        .attr('y2', d => (y(plotData.indexOf(d).toString()) || 0) + y.bandwidth() / 2)
        .style('stroke', d => d.style?.markerColor || params.lineColor)
        .style('stroke-width', 2)
        .style('opacity', 0.8);

      // CI caps (vertical lines at ends)
      const capWidth = 6;
      g.selectAll('.ci-cap-l')
        .data(plotData.filter(d => !d.isHeader))
        .enter()
        .append('line')
        .attr('x1', d => x(parseFloat(d[lciKey]) || parseFloat(d[params.xAxisDataset])))
        .attr('x2', d => x(parseFloat(d[lciKey]) || parseFloat(d[params.xAxisDataset])))
        .attr('y1', d => (y(plotData.indexOf(d).toString()) || 0) + y.bandwidth() / 2 - capWidth / 2)
        .attr('y2', d => (y(plotData.indexOf(d).toString()) || 0) + y.bandwidth() / 2 + capWidth / 2)
        .style('stroke', d => d.style?.markerColor || params.lineColor)
        .style('stroke-width', 2);

      g.selectAll('.ci-cap-r')
        .data(plotData.filter(d => !d.isHeader))
        .enter()
        .append('line')
        .attr('x1', d => x(parseFloat(d[uciKey]) || parseFloat(d[params.xAxisDataset])))
        .attr('x2', d => x(parseFloat(d[uciKey]) || parseFloat(d[params.xAxisDataset])))
        .attr('y1', d => (y(plotData.indexOf(d).toString()) || 0) + y.bandwidth() / 2 - capWidth / 2)
        .attr('y2', d => (y(plotData.indexOf(d).toString()) || 0) + y.bandwidth() / 2 + capWidth / 2)
        .style('stroke', d => d.style?.markerColor || params.lineColor)
        .style('stroke-width', 2);
    }

    // Effect size markers (Circles)
    const markerGroup = g.selectAll('.marker')
      .data(plotData.filter(d => !d.isHeader))
      .enter()
      .append('circle')
      .attr('cx', d => x(parseFloat(d[params.xAxisDataset])))
      .attr('cy', d => (y(plotData.indexOf(d).toString()) || 0) + y.bandwidth() / 2)
      .attr('r', d => d.style?.markerSize || params.markerSize)
      .style('fill', d => {
        if (d.sig === 'yes') return d.style?.markerColor || params.lineColor;
        return 'none';
      })
      .style('stroke', d => d.style?.markerColor || params.lineColor)
      .style('stroke-width', 2)
      .on('mouseover', function (event, d) {
        // This is where the tooltip logic would typically be, but it's handled by markerGroup.on('mouseenter') below.
        // This empty on('mouseover') might be a placeholder or an artifact.
      })
      .style('cursor', 'pointer');

    // Tooltip logic
    const tooltip = d3.select(tooltipRef.current);

    markerGroup
      .on('mouseenter', (event, d) => {
        tooltip.style('opacity', 1);
        const lciVal = params.xAxisDataset === 'beta' ? d.lci : d.or_lci;
        const uciVal = params.xAxisDataset === 'beta' ? d.uci : d.or_uci;
        const mainVal = d[params.xAxisDataset];

        tooltip.html(`
          <div class="space-y-1">
            <div class="text-white font-bold border-b border-slate-600 pb-1 mb-1">${d.trait || d.plot_trait}</div>
            <div class="flex justify-between gap-4"><span>N:</span><span class="text-blue-400 font-mono">${d.samplesize?.toLocaleString() || 'N/A'}</span></div>
            <div class="flex justify-between gap-4"><span>${params.xAxisDataset.toUpperCase()}:</span><span class="text-lime-400 font-mono">${mainVal}</span></div>
            <div class="flex justify-between gap-4"><span>95% CI:</span><span class="text-slate-300 font-mono">[${lciVal}, ${uciVal}]</span></div>
            <div class="flex justify-between gap-4"><span>P-Value:</span><span class="text-amber-400 font-mono">${parseFloat(d.pval).toExponential(2)}</span></div>
            <div class="mt-1 pt-1 border-t border-slate-600 text-[10px] text-slate-500 italic">Batch: ${d.batch}</div>
          </div>
        `);
      })
      .on('mousemove', (event) => {
        tooltip
          .style('left', (event.clientX + 15) + 'px')
          .style('top', (event.clientY - 28) + 'px');
      })
      .on('mouseleave', () => {
        tooltip.style('opacity', 0);
      });

    g.append('g')
      .call(d3.axisLeft(y).tickSize(0).tickFormat(i => {
        const item = plotData[parseInt(String(i))];
        if (item.isSpacer) return '';
        return String(item[params.yAxisDataset]);
      }))
      .selectAll('text')
      .each(function (_, i) {
        const item = plotData[i];
        const textElement = d3.select(this);
        if (item.isHeader) {
          textElement
            .style('font-size', `${params.groupLabelSize}px`)
            .style('fill', params.groupLabelColor)
            .style('font-weight', params.groupLabelBold ? 'bold' : 'normal')
            .style('font-style', params.groupLabelItalic ? 'italic' : 'normal')
            .style('text-decoration', params.groupLabelUnderline ? 'underline' : 'none');
        } else {
          textElement
            .style('fill', item.style?.labelColor || params.yAxisTextColor)
            .style('font-size', `${item.style?.labelSize || params.yAxisTextSize}px`)
            .style('font-weight', item.style?.bold ? 'bold' : '600')
            .style('font-style', item.style?.italic ? 'italic' : 'normal')
            .style('text-decoration', item.style?.underline ? 'underline' : 'none');
        }
      })
      .attr('dx', 0)
      .style('pointer-events', 'none')
      .call(wrap, 350);

    // Dynamic right side positioning
    const visibleColumns = params.displayColumns.filter(c => c.show);

    const rightSideStart = innerWidth + 40;
    const headRowY = -28;

    let currentX = 0;
    visibleColumns.forEach(box => {
      const colWidth = box.key === 'OR' ? 320 : (box.key === 'pval' ? 180 : 160);

      g.append('text')
        .attr('x', rightSideStart + currentX)
        .attr('y', headRowY)
        .text(box.label)
        .style('fill', '#334155')
        .style('font-size', '23px')
        .style('font-weight', 'bold');

      plotData.forEach((d, i) => {
        if (d.isHeader) return; // Skip numeric data for headers
        const rowY = (y(i.toString()) || 0) + y.bandwidth() / 2 + 5;
        let content = '';
        if (box.key === 'N') {
          const val = parseFloat(d.beta);
          content = isNaN(val) ? String(d.beta || '') : val.toFixed(box.decimals || 3);
        }
        else if (box.key === 'pval') {
          const val = parseFloat(d.pval);
          content = isNaN(val) ? String(d.pval || '') : (val < 0.001 ? val.toExponential(box.decimals || 1) : val.toFixed(box.decimals || 3));
        }
        else if (box.key === 'OR') {
          if (d.or) {
            const or = parseFloat(d.or).toFixed(box.decimals || 2);
            const lci = parseFloat(d.or_lci).toFixed(box.decimals || 2);
            const uci = parseFloat(d.or_uci).toFixed(box.decimals || 2);
            content = `${or} (${lci}, ${uci})`;
          }
        }

        g.append('text')
          .attr('x', rightSideStart + currentX)
          .attr('y', rowY)
          .text(content)
          .style('fill', box.key === 'pval' && d.sig === 'yes' ? '#000' : '#475569')
          .style('font-weight', box.key === 'pval' && d.sig === 'yes' ? '700' : '500')
          .style('font-size', '22px');
      });

      currentX += colWidth;
    });


    // Domain and tick lines
    g.selectAll('.domain').style('stroke', '#94a3b8');
    g.selectAll('.tick line').style('stroke', '#cbd5e1');

    svg.append('g')
      .attr('transform', `translate(${margin.left}, ${innerHeight + margin.top})`)
      .call(d3.axisBottom(x)
        .ticks(Math.min(10, width / (120 / params.xAxisTickStep))) // Capped at 10
        .tickFormat(d => d === 0 ? '0' : String(d))
      )
      .selectAll('text')
      .style('fill', '#1e293b')
      .style('font-size', '20px');

    // Footer: Title & Description
    let currentFooterY = innerHeight + 70; // Added more margin above title
    const footerX = -margin.left + 20;

    if (params.showTitle && params.title) {
      g.append('text')
        .attr('x', footerX)
        .attr('y', currentFooterY)
        .text(params.title)
        .style('fill', params.titleColor)
        .style('font-weight', 'bold')
        .style('font-size', `${params.titleSize}px`);

      currentFooterY += 40;
    }

    if (params.showSeparator) {
      g.append('line')
        .attr('x1', footerX)
        .attr('y1', currentFooterY)
        .attr('x2', innerWidth + margin.right - 40)
        .attr('y2', currentFooterY)
        .style('stroke', '#cbd5e1')
        .style('stroke-width', params.separatorSize)
        .style('stroke-dasharray', params.separatorStyle === 'solid' ? 'none' : (params.separatorStyle === 'dashed' ? '8,8' : '2,2'));

      currentFooterY += 40;
    }

    if (params.showDescription && params.description) {
      g.append('text')
        .attr('x', footerX)
        .attr('y', currentFooterY)
        .text(params.description)
        .style('fill', params.descColor)
        .style('font-size', `${params.descSize}px`)
        .style('font-weight', '500');
    }

  }, [data, params, selectedBatch, groupFilter]);

  const batches = Array.from(new Set((data || []).map(row => String(row.batch || '')))).filter(Boolean);
  const columns = data && data.length > 0 ? Object.keys(data[0]) : [];

  const groupValues = params.groupBy ? Array.from(new Set((data || []).map(row => String(row[params.groupBy] || '')))).filter(Boolean).sort() : [];

  const tableData = (data || []).filter(row => {
    const batchMatch = selectedBatch === 'all' || String(row.batch || '') === selectedBatch;
    const groupMatch = groupFilter.length === 0 || groupFilter.includes(String(row[params.groupBy] || ''));
    return batchMatch && groupMatch;
  });

  const filteredData = tableData.filter(row => !row.hidden);

  return (
    <div className="flex flex-col h-screen text-slate-100 p-4 gap-4 max-w-[1850px] mx-auto relative overflow-hidden">
      {activeStyleRow && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-700 p-6 rounded-2xl shadow-2xl w-full max-w-md animate-in fade-in zoom-in duration-200">
            <div className="flex justify-between items-center mb-6 border-b border-slate-800 pb-4">
              <div>
                <h3 className="text-lg font-bold text-slate-100">Customize Result Line</h3>
                <p className="text-xs text-slate-400 mt-1">{activeStyleRow[params.yAxisDataset]}</p>
              </div>
              <button onClick={() => setActiveStyleRow(null)} className="p-2 hover:bg-slate-800 rounded-lg text-slate-400">
                <X className="rotate-90" size={18} />
              </button>
            </div>

            <div className="space-y-6">
              {/* Marker Styles */}
              <div className="space-y-4">
                <h4 className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Dot / Marker Styles</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-slate-800/40 p-3 rounded-xl border border-slate-800">
                    <label className="text-xs text-slate-400 mb-2 block">Color</label>
                    <input
                      type="color"
                      className="w-full h-8 rounded-lg cursor-pointer bg-transparent border-none"
                      value={activeStyleRow.style?.markerColor || params.lineColor}
                      onChange={(e) => {
                        const newData = [...data!];
                        const idx = data!.findIndex(d => d === activeStyleRow);
                        newData[idx].style = { ...newData[idx].style, markerColor: e.target.value, customized: true };
                        setData(newData);
                      }}
                    />
                  </div>
                  <div className="bg-slate-800/40 p-3 rounded-xl border border-slate-800">
                    <label className="text-xs text-slate-400 mb-2 block">Size</label>
                    <input
                      type="number"
                      className="w-full bg-slate-900 border border-slate-700 rounded p-1 text-sm outline-none focus:ring-1 focus:ring-blue-500"
                      value={activeStyleRow.style?.markerSize || params.markerSize}
                      onChange={(e) => {
                        const newData = [...data!];
                        const idx = data!.findIndex(d => d === activeStyleRow);
                        newData[idx].style = { ...newData[idx].style, markerSize: parseInt(e.target.value), customized: true };
                        setData(newData);
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Label Styles */}
              <div className="space-y-4">
                <h4 className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Y-Axis Text Styles</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-slate-800/40 p-3 rounded-xl border border-slate-800">
                    <label className="text-xs text-slate-400 mb-2 block">Text Color</label>
                    <input
                      type="color"
                      className="w-full h-8 rounded-lg cursor-pointer bg-transparent border-none"
                      value={activeStyleRow.style?.labelColor || '#1e293b'}
                      onChange={(e) => {
                        const newData = [...data!];
                        const idx = data!.findIndex(d => d === activeStyleRow);
                        newData[idx].style = { ...newData[idx].style, labelColor: e.target.value, customized: true };
                        setData(newData);
                      }}
                    />
                  </div>
                  <div className="bg-slate-800/40 p-3 rounded-xl border border-slate-800">
                    <label className="text-xs text-slate-400 mb-2 block">Font Size</label>
                    <input
                      type="number"
                      className="w-full bg-slate-900 border border-slate-700 rounded p-1 text-sm outline-none focus:ring-1 focus:ring-blue-500"
                      value={activeStyleRow.style?.labelSize || 22}
                      onChange={(e) => {
                        const newData = [...data!];
                        const idx = data!.findIndex(d => d === activeStyleRow);
                        newData[idx].style = { ...newData[idx].style, labelSize: parseInt(e.target.value), customized: true };
                        setData(newData);
                      }}
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      const newData = [...data!];
                      const idx = data!.findIndex(d => d === activeStyleRow);
                      newData[idx].style = { ...newData[idx].style, bold: !newData[idx].style.bold, customized: true };
                      setData(newData);
                    }}
                    className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all ${activeStyleRow.style?.bold ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-500 hover:bg-slate-700'}`}
                  >B</button>
                  <button
                    onClick={() => {
                      const newData = [...data!];
                      const idx = data!.findIndex(d => d === activeStyleRow);
                      newData[idx].style = { ...newData[idx].style, italic: !newData[idx].style.italic, customized: true };
                      setData(newData);
                    }}
                    className={`flex-1 py-2 rounded-xl text-xs italic transition-all ${activeStyleRow.style?.italic ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-500 hover:bg-slate-700'}`}
                  >I</button>
                  <button
                    onClick={() => {
                      const newData = [...data!];
                      const idx = data!.findIndex(d => d === activeStyleRow);
                      newData[idx].style = { ...newData[idx].style, underline: !newData[idx].style.underline, customized: true };
                      setData(newData);
                    }}
                    className={`flex-1 py-2 rounded-xl text-xs underline transition-all ${activeStyleRow.style?.underline ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-500 hover:bg-slate-700'}`}
                  >U</button>
                </div>
              </div>
            </div>

            <div className="mt-8">
              <button
                onClick={() => setActiveStyleRow(null)}
                className="w-full bg-blue-600 hover:bg-blue-500 py-3 rounded-xl font-bold text-sm transition-all shadow-lg shadow-blue-900/40"
              >
                Apply & Save
              </button>
            </div>
          </div>
        </div>
      )}
      <div
        ref={tooltipRef}
        className="fixed z-[9999] pointer-events-none bg-slate-900/95 backdrop-blur-md border border-slate-600 p-3 rounded-xl shadow-2xl text-xs text-slate-200 min-w-[200px] opacity-0 transition-opacity duration-150"
        style={{ top: 0, left: 0, boxShadow: '0 20px 50px rgba(0,0,0,0.5)' }}
      />
      <div className="flex flex-col lg:flex-row flex-1 min-h-0 gap-4">
        {/* Left Sidebar */}
        <div className="w-full lg:w-1/3 flex flex-col min-h-0">
          <div className="bg-slate-800/80 backdrop-blur-md rounded-2xl p-6 border border-slate-700 shadow-xl overflow-y-auto custom-scrollbar flex-1">
            <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent flex items-center gap-3 mb-6">
              <img src="/sequoia-logo.png" alt="Sequoia Genetics" className="h-8 object-contain" />
              Genetics Plotter
            </h1>

            {/* File Upload Room */}
            <div className="mb-6">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-2">
                <UploadCloud size={16} /> Upload Data
              </h2>
              <div className="relative border-2 border-dashed border-slate-600 rounded-xl p-6 text-center hover:border-blue-500 hover:bg-slate-700/50 transition-all cursor-pointer group">
                <input
                  type="file"
                  accept=".csv"
                  onChange={handleFileUpload}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
                <div className="flex flex-col items-center gap-2 text-slate-400 group-hover:text-blue-300">
                  <FileText size={32} />
                  <span className="font-medium">{file ? file.name : "Drop CSV here or click to browse"}</span>
                </div>
              </div>
              {error && (
                <div className="mt-3 p-3 bg-red-500/10 border border-red-500/50 rounded-lg text-red-400 text-sm flex items-start gap-2">
                  <Info className="shrink-0 mt-0.5" size={16} />
                  <span>{error}</span>
                </div>
              )}
            </div>


            <div className="mb-6">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-2">
                <Settings size={16} /> Selection
              </h2>
              <div className="space-y-4">
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">Group By</label>
                  <select
                    value={params.groupBy}
                    onChange={(e) => {
                      setParams({ ...params, groupBy: e.target.value });
                      setGroupFilter([]); // Reset filter on column change
                    }}
                    className="w-full bg-slate-900 border border-slate-600 rounded-lg p-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mb-3"
                  >
                    <option value="">No Grouping</option>
                    {columns.map(col => (
                      <option key={col} value={col}>{col.toUpperCase()}</option>
                    ))}
                  </select>

                  {params.groupBy && (
                    <div className="mb-4">
                      <div className="flex items-center gap-2 mb-2">
                        <label className="text-[10px] text-slate-500 uppercase tracking-tighter">Filter {params.groupBy.toUpperCase()} values:</label>
                        <label className="flex items-center gap-1.5 text-[10px] text-slate-400 cursor-pointer hover:text-blue-400 transition-colors ml-auto">
                          <input
                            type="checkbox"
                            checked={params.showGroupLabels}
                            onChange={(e) => setParams({ ...params, showGroupLabels: e.target.checked })}
                            className="w-3 h-3 rounded"
                          />
                          Category Headers
                        </label>
                      </div>

                      {params.showGroupLabels && (
                        <div className="flex flex-wrap gap-2 mb-3 bg-slate-900/60 p-2 rounded-lg border border-slate-700 items-center justify-between">
                          <div className="flex items-center gap-2">
                            <input type="color" value={params.groupLabelColor} onChange={(e) => setParams({ ...params, groupLabelColor: e.target.value })} className="w-5 h-5 rounded cursor-pointer" />
                            <input type="number" value={params.groupLabelSize} onChange={(e) => setParams({ ...params, groupLabelSize: parseInt(e.target.value) })} className="w-10 bg-slate-800 border border-slate-600 rounded p-1 text-[10px]" />
                          </div>
                          <div className="flex items-center gap-1.5 border-l border-slate-700 pl-2">
                            <button
                              onClick={() => setParams({ ...params, groupLabelBold: !params.groupLabelBold })}
                              className={`p-1 rounded text-[10px] w-6 transition-colors font-bold ${params.groupLabelBold ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-500 hover:text-slate-400'}`}
                            >B</button>
                            <button
                              onClick={() => setParams({ ...params, groupLabelItalic: !params.groupLabelItalic })}
                              className={`p-1 rounded text-[10px] w-6 italic transition-colors ${params.groupLabelItalic ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-500 hover:text-slate-400'}`}
                            >I</button>
                            <button
                              onClick={() => setParams({ ...params, groupLabelUnderline: !params.groupLabelUnderline })}
                              className={`p-1 rounded text-[10px] w-6 underline transition-colors ${params.groupLabelUnderline ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-500 hover:text-slate-400'}`}
                            >U</button>
                          </div>
                        </div>
                      )}

                      <div className="flex flex-wrap gap-1 bg-slate-900/40 p-2 rounded-lg border border-slate-700 min-h-[40px]">
                        <button
                          onClick={() => setGroupFilter([])}
                          className={`text-[10px] px-2 py-1 rounded transition-colors ${groupFilter.length === 0 ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}
                        >
                          ALL
                        </button>
                        {groupValues.map(val => (
                          <button
                            key={val}
                            onClick={() => {
                              if (groupFilter.includes(val)) {
                                setGroupFilter(groupFilter.filter(v => v !== val));
                              } else {
                                setGroupFilter([...groupFilter, val]);
                              }
                            }}
                            className={`text-[10px] px-2 py-1 rounded transition-colors ${groupFilter.includes(val) ? 'bg-blue-500/30 border border-blue-500 text-blue-300' : 'bg-slate-800 text-slate-400 border border-transparent hover:border-slate-600'}`}
                          >
                            {val}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <label className="text-xs text-slate-500 mb-2 block">Display Columns (Rename & Reorder)</label>
                  <div className="space-y-2 bg-slate-900/50 p-3 rounded-xl border border-slate-700">
                    {params.displayColumns.map((col, idx) => (
                      <div key={col.id} className="flex items-center gap-2 bg-slate-800 p-2 rounded-lg border border-slate-700">
                        <input
                          type="checkbox"
                          checked={col.show}
                          onChange={(e) => {
                            const newCols = [...params.displayColumns];
                            newCols[idx].show = e.target.checked;
                            setParams({ ...params, displayColumns: newCols });
                          }}
                          className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-blue-500 focus:ring-blue-500"
                        />
                        <input
                          type="text"
                          value={col.label}
                          onChange={(e) => {
                            const newCols = [...params.displayColumns];
                            newCols[idx].label = e.target.value;
                            setParams({ ...params, displayColumns: newCols });
                          }}
                          className="bg-transparent text-[10px] text-slate-200 outline-none flex-1 border-b border-transparent focus:border-blue-500"
                        />
                        <div className="flex items-center gap-1 group translate-x-1">
                          <span className="text-[9px] text-slate-600 group-hover:text-slate-400">DEC:</span>
                          <input
                            type="number"
                            min="0" max="6"
                            className="w-10 bg-slate-900 border border-slate-700 rounded p-1 text-[10px] focus:ring-1 focus:ring-blue-500"
                            value={col.decimals}
                            onChange={(e) => {
                              const newCols = [...params.displayColumns];
                              newCols[idx].decimals = parseInt(e.target.value);
                              setParams({ ...params, displayColumns: newCols });
                            }}
                          />
                        </div>
                        <div className="flex flex-col gap-1 ml-1 scale-90">
                          <button
                            disabled={idx === 0}
                            onClick={() => {
                              const newCols = [...params.displayColumns];
                              const temp = newCols[idx];
                              newCols[idx] = newCols[idx - 1];
                              newCols[idx - 1] = temp;
                              setParams({ ...params, displayColumns: newCols });
                            }}
                            className="p-1 hover:bg-slate-700 rounded disabled:opacity-20 translate-y-1"
                          >
                            <ChevronRight className="-rotate-90" size={12} />
                          </button>
                          <button
                            disabled={idx === params.displayColumns.length - 1}
                            onClick={() => {
                              const newCols = [...params.displayColumns];
                              const temp = newCols[idx];
                              newCols[idx] = newCols[idx + 1];
                              newCols[idx + 1] = temp;
                              setParams({ ...params, displayColumns: newCols });
                            }}
                            className="p-1 hover:bg-slate-700 rounded disabled:opacity-20 -translate-y-1"
                          >
                            <ChevronRight className="rotate-90" size={12} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-xs text-slate-500 mb-1 block flex items-center justify-between">
                    X-Axis Scale & Precision
                    <span className="text-blue-400 font-bold">{params.xAxisTickStep} Step</span>
                  </label>
                  <div className="flex flex-col gap-2 bg-slate-900 border border-slate-700 rounded-lg p-3">
                    <select
                      value={params.xAxisDataset}
                      onChange={(e) => setParams({ ...params, xAxisDataset: e.target.value })}
                      className="w-full bg-slate-800 border-none rounded p-1 text-xs mb-1"
                    >
                      <option value="">Select Column</option>
                      {columns.filter(c => ['beta', 'or', 'se', 'pval', 'samplesize', 'plotsamplesize'].includes(c)).map(col => (
                        <option key={col} value={col}>{col.toUpperCase()}</option>
                      ))}
                    </select>
                    <input
                      type="range"
                      min="0.1"
                      max="5.0"
                      step="0.1"
                      value={params.xAxisTickStep}
                      onChange={(e) => setParams({ ...params, xAxisTickStep: parseFloat(e.target.value) })}
                      className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
                    />
                    <div className="flex justify-between text-[8px] text-slate-500 uppercase">
                      <span>Fine Grid</span>
                      <span>Coarse Grid</span>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="text-xs text-slate-500 mb-1 block flex items-center justify-between">
                    Canvas Padding
                    <span className="text-blue-400 font-bold">{params.canvasPadding}px</span>
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="2"
                    value={params.canvasPadding}
                    onChange={(e) => setParams({ ...params, canvasPadding: parseInt(e.target.value) })}
                    className="w-full h-1.5 bg-slate-900 rounded-lg appearance-none cursor-pointer accent-blue-500 border border-slate-700"
                  />
                </div>

                <div>
                  <label className="text-xs text-slate-500 mb-1 block">Y-Axis Dataset</label>
                  <select
                    value={params.yAxisDataset}
                    onChange={(e) => setParams({ ...params, yAxisDataset: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-600 rounded-lg p-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select Column</option>
                    {columns.filter(c => !['beta', 'se', 'pval', 'or', 'or_lci', 'or_uci', 'lci', 'uci', 'sig'].includes(c)).map(col => (
                      <option key={col} value={col}>{col.toUpperCase()}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="mb-6">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-2">
                <FileText size={16} /> Annotations Styling
              </h2>
              <div className="space-y-4 bg-slate-900/40 p-4 rounded-xl border border-slate-700">
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer">
                      <input type="checkbox" checked={params.showTitle} onChange={(e) => setParams({ ...params, showTitle: e.target.checked })} />
                      Show Title
                    </label>
                    <div className="flex gap-2 items-center">
                      <input type="color" value={params.titleColor} onChange={(e) => setParams({ ...params, titleColor: e.target.value })} className="w-5 h-5 rounded cursor-pointer" />
                      <input type="number" value={params.titleSize} onChange={(e) => setParams({ ...params, titleSize: parseInt(e.target.value) })} className="w-12 bg-slate-800 border border-slate-600 rounded p-1 text-[10px]" />
                    </div>
                  </div>
                  <textarea
                    placeholder="Enter Plot Title..."
                    disabled={!params.showTitle}
                    value={params.title}
                    onChange={(e) => setParams({ ...params, title: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 h-12 resize-none disabled:opacity-30"
                  />
                </div>

                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer">
                      <input type="checkbox" checked={params.showDescription} onChange={(e) => setParams({ ...params, showDescription: e.target.checked })} />
                      Show Description
                    </label>
                    <div className="flex gap-2 items-center">
                      <input type="color" value={params.descColor} onChange={(e) => setParams({ ...params, descColor: e.target.value })} className="w-5 h-5 rounded cursor-pointer" />
                      <input type="number" value={params.descSize} onChange={(e) => setParams({ ...params, descSize: parseInt(e.target.value) })} className="w-12 bg-slate-800 border border-slate-600 rounded p-1 text-[10px]" />
                    </div>
                  </div>
                  <textarea
                    placeholder="Enter Plot Description..."
                    disabled={!params.showDescription}
                    value={params.description}
                    onChange={(e) => setParams({ ...params, description: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 h-16 resize-none disabled:opacity-30"
                  />
                </div>

                <div className="flex flex-col gap-2 pt-2 border-t border-slate-700">
                  <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer">
                    <input type="checkbox" checked={params.showSeparator} onChange={(e) => setParams({ ...params, showSeparator: e.target.checked })} />
                    Show Separator Line
                  </label>
                  <div className="flex items-center gap-4 pl-5">
                    <div className="flex items-center gap-2 text-[10px]">
                      <span>Style:</span>
                      <select value={params.separatorStyle} onChange={(e) => setParams({ ...params, separatorStyle: e.target.value })} className="bg-slate-800 border-none rounded p-1">
                        <option value="solid">Solid</option>
                        <option value="dashed">Dashed</option>
                        <option value="dotted">Dotted</option>
                      </select>
                    </div>
                    <div className="flex items-center gap-2 text-[10px]">
                      <span>Size:</span>
                      <input type="number" step="0.5" value={params.separatorSize} onChange={(e) => setParams({ ...params, separatorSize: parseFloat(e.target.value) })} className="w-10 bg-slate-800 border-none rounded p-1" />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="mb-0">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-2">
                <Settings size={16} /> Display Options
              </h2>
              <div className="space-y-4">

                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-slate-300">Marker Size</span>
                    <span className="text-blue-400 font-mono">{params.markerSize}px</span>
                  </div>
                  <input
                    type="range"
                    min="2" max="10"
                    value={params.markerSize}
                    onChange={(e) => setParams({ ...params, markerSize: parseInt(e.target.value) })}
                    className="w-full accent-blue-500"
                  />
                </div>

                <div>
                  <span className="text-sm text-slate-300 block mb-2">Theme Color</span>
                  <div className="flex flex-wrap gap-2 items-center">
                    {['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'].map(color => (
                      <button
                        key={color}
                        onClick={() => setParams({ ...params, lineColor: color })}
                        className={`w-8 h-8 rounded-full border-2 transition-transform ${params.lineColor.toLowerCase() === color.toLowerCase() ? 'border-white scale-110' : 'border-transparent'}`}
                        style={{ backgroundColor: color }}
                      />
                    ))}
                    <div className="flex items-center gap-2 border-l border-slate-700 pl-2">
                      <div className="relative w-8 h-8 rounded-full border-2 border-slate-600 overflow-hidden flex items-center justify-center bg-slate-900 hover:border-blue-500 transition-colors">
                        <input
                          type="color"
                          className="absolute -inset-2 w-12 h-12 cursor-pointer opacity-100 bg-transparent border-none appearance-none"
                          value={params.lineColor.startsWith('#') ? params.lineColor : '#000000'}
                          onChange={(e) => setParams({ ...params, lineColor: e.target.value })}
                        />
                        <Pipette size={14} className="text-white/40 pointer-events-none z-10" />
                      </div>
                      <input
                        type="text"
                        className="w-20 bg-slate-900 border border-slate-700 rounded-lg p-1.5 text-[10px] uppercase font-mono text-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        placeholder="#HEX"
                        value={params.lineColor}
                        onChange={(e) => setParams({ ...params, lineColor: e.target.value })}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Canvas */}
        <div className="w-full lg:w-2/3 flex flex-col min-h-0">
          <div className="bg-slate-800/80 backdrop-blur-md rounded-2xl flex-1 border border-slate-700 shadow-xl overflow-hidden flex flex-col">
            <div className="p-4 border-b border-slate-700 flex justify-between items-center bg-slate-800/50">
              <h3 className="font-medium text-slate-200 flex items-center gap-2">
                Forest Plot Preview
              </h3>
              <button
                onClick={downloadImage}
                disabled={!data}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-lg shadow-blue-500/20"
              >
                <Download size={16} /> Download PNG
              </button>
            </div>
            <div className="flex-1 p-6 relative flex items-center justify-center">

              {!filteredData || filteredData.length === 0 ? (
                <div className="text-center text-slate-500">
                  <img src="/sequoia-logo.png" alt="Sequoia Genetics" className="h-16 mx-auto mb-4 opacity-30 grayscale contrast-125" />
                  <p>Upload a CSV file or check your filter settings.</p>
                </div>
              ) : (
                <div ref={plotRef} className="w-full h-full bg-slate-900/50 rounded-xl border border-slate-700 relative overflow-hidden" />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Table */}
      {filteredData && filteredData.length > 0 && (
        <div className="bg-slate-800/80 backdrop-blur-md rounded-2xl border border-slate-700 shadow-xl overflow-hidden flex flex-col h-[30%] min-h-[250px] shrink-0">
          <div className="p-4 border-b border-slate-700 flex justify-between items-center bg-slate-800/50 sticky top-0 z-10">
            <h3 className="font-medium text-slate-200 flex items-center gap-2">
              <FileText size={18} className="text-blue-400" />
              Calculated Results Preview
            </h3>
            <span className="text-xs text-slate-400">{filteredData.length} records in {selectedBatch}</span>
          </div>
          {/* Data Table Preview - Constrained to prevent layout breakage */}
          <div className="flex-1 overflow-auto rounded-xl border border-slate-700/50">
            <table className="w-full text-left text-sm border-collapse">
              <thead className="bg-slate-900/50 sticky top-0 backdrop-blur-sm shadow-sm">
                <tr className="bg-slate-800/80 sticky top-0 z-10 text-[10px]">
                  <th className="p-3 text-left font-semibold text-slate-400 border-r border-slate-700 uppercase tracking-wider w-10">Reorder</th>
                  <th className="p-3 text-left font-semibold text-slate-400 border-r border-slate-700 uppercase tracking-wider w-10">Visibility</th>
                  <th className="p-3 text-left font-semibold text-slate-400 border-r border-slate-700 uppercase tracking-wider w-10">Style</th>
                  {columns.filter(c => !['hidden', 'style', 'sig'].includes(c)).map(col => (
                    <th key={col} className="p-3 text-left font-semibold text-slate-400 border-r border-slate-700 uppercase tracking-wider">
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                {tableData.map((row, i) => {
                  const yVal = String(row[params.yAxisDataset]);
                  const isDuplicate = (data || []).filter(r => String(r[params.yAxisDataset]) === yVal).length > 1;

                  return (
                    <tr
                      key={i}
                      className={`hover:bg-slate-700/30 transition-colors group cursor-grab active:cursor-grabbing ${isDuplicate ? 'bg-amber-500/5' : ''} ${draggedIdx === i ? 'opacity-30' : ''}`}
                      draggable="true"
                      onDragStart={() => setDraggedIdx(i)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        if (draggedIdx === null || draggedIdx === i) return;
                        const newData = [...data!];
                        const targetIdx = data!.indexOf(row);
                        const sourceRow = tableData[draggedIdx];
                        const sourceIdx = data!.indexOf(sourceRow);

                        const movedItem = newData.splice(sourceIdx, 1)[0];
                        // Adjust target index if necessary
                        const finalTarget = newData.indexOf(row);
                        newData.splice(finalTarget + (draggedIdx < i ? 1 : 0), 0, movedItem);

                        setData(newData);
                        setDraggedIdx(null);
                      }}
                      onDragEnd={() => setDraggedIdx(null)}
                    >
                      <td className="p-3 text-center border-r border-slate-700/30 bg-slate-900/10">
                        <div className="flex justify-center text-slate-600 group-hover:text-blue-400 transition-colors">
                          <ChevronRight size={16} className="-rotate-90" />
                        </div>
                      </td>
                      <td className="p-3 text-center border-r border-slate-700/30">
                        <input
                          type="checkbox"
                          checked={!row.hidden}
                          onChange={(e) => {
                            const newData = [...data!];
                            const globalIndex = data!.findIndex(d => d === row);
                            if (globalIndex !== -1) {
                              newData[globalIndex] = { ...row, hidden: !e.target.checked };
                              setData(newData);
                            }
                          }}
                          className="w-4 h-4 rounded border-slate-600"
                        />
                      </td>
                      <td className="p-3 text-center border-r border-slate-700/30">
                        <button
                          onClick={() => setActiveStyleRow(row)}
                          className={`p-1 hover:bg-slate-700 rounded transition-colors ${row.style?.customized ? 'text-blue-500 bg-blue-500/10' : 'text-slate-400'}`}
                          title="Row Style Settings"
                        >
                          <Settings size={14} />
                        </button>
                      </td>
                      {Object.keys(row).map((key, j) => {
                        if (['hidden', 'style', 'sig'].includes(key)) return null;
                        return (
                          <td key={j} className={`p-0 border-r border-slate-700/30 ${key === params.yAxisDataset && isDuplicate ? 'bg-amber-500/20' : ''}`}>
                            <input
                              type="text"
                              value={String(row[key] !== null && row[key] !== undefined ? row[key] : '')}
                              onChange={(e) => {
                                const newData = [...data!];
                                const globalIndex = data!.findIndex(d => d === row);
                                if (globalIndex !== -1) {
                                  newData[globalIndex] = { ...row, [key]: e.target.value };
                                  setData(newData);
                                }
                              }}
                              className={`w-full bg-transparent p-3 outline-none focus:bg-slate-900/80 transition-all border-none ${isDuplicate && key === params.yAxisDataset ? 'text-amber-200 font-bold' : 'text-slate-400'}`}
                            />
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )
      }

      {/* Footer */}
      <footer className="mt-auto pt-2 pb-1 border-t border-slate-800 flex flex-col md:flex-row justify-between items-center text-[10px] text-slate-500 uppercase tracking-widest gap-4 shrink-0">
        <div className="flex items-center gap-4">
          <span>&copy; {new Date().getFullYear()} <a href="https://sequoiagenetics.com" target="_blank" rel="noopener noreferrer" className="hover:text-blue-400 transition-colors underline decoration-slate-800 underline-offset-4">sequoiagenetics.com</a></span>
          <span className="opacity-30">|</span>
          <span>All Rights Reserved</span>
        </div>
        <div className="flex items-center gap-3 grayscale opacity-60 hover:opacity-100 hover:grayscale-0 transition-all cursor-default">
          <span className="lowercase normal-case tracking-normal text-slate-600">Developed by</span>
          <a href="https://wulfstananalytics.com" target="_blank" rel="noopener noreferrer">
            <img src="/wulfstan-logo.png" alt="Wulfstan Analytics" className="h-5 object-contain" />
          </a>
        </div>
      </footer>
    </div >
  );
}
