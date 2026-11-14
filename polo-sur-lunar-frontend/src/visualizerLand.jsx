import { useEffect, useRef } from 'react';
import { createVisualizer } from './components/interactive-visualizer/visualizerLand';

export default function Visualizer3D() {
  const ref = useRef(null);

  useEffect(() => {
    const viz = createVisualizer(ref.current, {
      landing: { name: 'Shackleton', x: 10, z: -15 },
    });
    return () => viz.dispose();
  }, []);

  return <div ref={ref} style={{ width: '100vw', height: '100vh' }} />;
}