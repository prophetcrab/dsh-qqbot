import React from 'react'

const h = React.createElement

export function QqbotIcon(props) {
  const size = props && props.size ? props.size : 18
  return h('svg', { viewBox: '0 0 16 16', width: size, height: size, 'aria-hidden': true, fill: 'none' },
    h('path', { d: 'M8 1.6v2', stroke: 'currentColor', strokeWidth: 1.2, strokeLinecap: 'round' }),
    h('circle', { cx: 8, cy: 1.4, r: 0.9, fill: 'currentColor' }),
    h('rect', { x: 2, y: 3.4, width: 12, height: 9.2, rx: 3, stroke: 'currentColor', strokeWidth: 1.2 }),
    h('circle', { cx: 5.7, cy: 7.4, r: 0.9, fill: 'currentColor' }),
    h('circle', { cx: 10.3, cy: 7.4, r: 0.9, fill: 'currentColor' }),
    h('path', { d: 'M5.8 10.2h4.4', stroke: 'currentColor', strokeWidth: 1.2, strokeLinecap: 'round' }),
    h('path', { d: 'M4.2 12.6l-.8 1.6 2.3-.8', stroke: 'currentColor', strokeWidth: 1.1, strokeLinecap: 'round', strokeLinejoin: 'round' }))
}
