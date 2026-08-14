import { createRoot } from 'react-dom/client';
import { CartaComposta } from './src/client/componentes/CartaComposta.tsx';
import { cartaPorId } from './src/data/cartas.ts';

/** conferência visual: clássica com arte × cartas do Quatro Elementos (ainda sem arte) */
const ids = [1, 49, 47, 65, 53, 62];

createRoot(document.getElementById('raiz')!).render(
  <>
    {ids.map((id) => {
      const carta = cartaPorId(id);
      return (
        <div key={id} style={{ width: 270 }}>
          <CartaComposta
            carta={carta}
            arte={carta.img ? `/assets/arte/${carta.img.replace(/\.png$/, '.webp')}` : undefined}
          />
        </div>
      );
    })}
  </>,
);
