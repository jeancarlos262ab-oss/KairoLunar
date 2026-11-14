import React, {useEffect, useRef} from 'react'
import * as d3 from 'd3'

export default function Polar() {
  const ref = useRef()
  useEffect(() => {
    const svg = d3.select(ref.current); svg.selectAll('*').remove()
    const w = 160, c = w / 2, R = 62, r = d3.scaleLinear([90, 0], [0, R])
    const g = svg.append('g').attr('transform', `translate(${c},${c})`)
    const arc = d3.arc()
    g.append('path').attr('d', arc({innerRadius: 0, outerRadius: R + 10, startAngle: -1.05, endAngle: 0.05}))
      .attr('fill', '#fff').attr('opacity', .12)
    ;[0, 30, 60].forEach(e => g.append('circle').attr('r', r(e)).attr('fill', 'none').attr('stroke', '#fff').attr('stroke-opacity', e ? .2 : .7))
    ;[0, 90, 180, 270].forEach(a => {
      const t = (a - 90) * Math.PI / 180
      g.append('line').attr('x2', Math.cos(t) * (R + 8)).attr('y2', Math.sin(t) * (R + 8)).attr('stroke', '#fff').attr('stroke-opacity', .15)
    })
    g.append('text').attr('y', -R - 14).attr('text-anchor', 'middle').attr('class', 'tiny').text('N')
    g.append('text').attr('x', 30).attr('y', -6).attr('class', 'tiny').text('0°')
    const pt = (az, el, col, rad) => g.append('circle').attr('cx', Math.cos((az - 90) * Math.PI / 180) * r(el)).attr('cy', Math.sin((az - 90) * Math.PI / 180) * r(el)).attr('r', rad).attr('fill', col)
    pt(-80, 1.4, '#ffb820', 6).attr('stroke', '#fff').attr('stroke-opacity', .5)
    pt(125, 4, '#4d5fb3', 4)
  }, [])
  return <svg ref={ref} width="160" height="160"/>
}
