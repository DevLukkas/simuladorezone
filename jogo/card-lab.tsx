import { createRoot } from 'react-dom/client';
import { ComposedCard } from './src/client/components/ComposedCard.tsx';
import { cardById } from './src/data/cards.ts';

/** conferência visual: clássica com arte × cartas do Quatro Elementos (ainda sem arte) */
const ids = [1, 49, 47, 65, 53, 62];

createRoot(document.getElementById('raiz')!).render(
  <>
    {ids.map((id) => {
      const card = cardById(id);
      return (
        <div key={id} style={{ width: 270 }}>
          <ComposedCard
            card={card}
            art={card.img ? `/assets/arte/${card.img.replace(/\.png$/, '.webp')}` : undefined}
          />
        </div>
      );
    })}
  </>,
);
