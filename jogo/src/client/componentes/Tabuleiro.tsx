import { useEffect, useState } from 'react';
import { cartaPorId } from '../../data/cartas.ts';
import { heroiPorChave } from '../../data/herois.ts';
import type { Carta as CartaDoCatalogo, Elemento } from '../../data/tipos.ts';
import { podeSerAlvoDeAtaque } from '../../engine/combate.ts';
import {
  SEGUNDOS_DE_REACAO,
  SEGUNDOS_DO_TURNO,
  ladoOposto,
  type CartaNaZona,
  type CriaturaEmCampo,
  type LadoId,
} from '../../engine/estado.ts';
import type { VisaoDoJogo } from '../../engine/visao.ts';
import { usePartidaStore } from '../estado/partidaStore.ts';
import { CartaImagem, CriaturaNoCampo } from './Carta.tsx';

type ModoDeAlvo =
  | { tipo: 'invocar'; uidCarta: string }
  | { tipo: 'anexar'; uidCarta: string }
  | { tipo: 'comando'; uidCarta: string; ladoDoAlvo: LadoId }
  | null;

function podeAtacarNaVisao(visao: VisaoDoJogo, criatura: CriaturaEmCampo): boolean {
  if (visao.vencedor || visao.fase !== 'batalha' || visao.ladoAtivo !== visao.lado) return false;
  if (criatura.atacouNoTurno === visao.turno) return false;
  if (criatura.podeAtacarAPartirDoTurno > visao.turno) return false;
  if ((criatura.naoPodeAtacarAteTurno ?? 0) >= visao.turno) return false;
  return true;
}

export function Tabuleiro() {
  const { visao, modo, registro, ultimaRecusa, apelidoOponente, prazoEmMs, enviar, sair, iniciarTreino } =
    usePartidaStore();
  const [selecaoDaMao, setSelecaoDaMao] = useState<string | null>(null);
  const [vendoDescarte, setVendoDescarte] = useState<'eu' | 'oponente' | null>(null);
  const [modoDeAlvo, setModoDeAlvo] = useState<ModoDeAlvo>(null);
  const [substituindo, setSubstituindo] = useState<{ uidCarta: string; slot: number } | null>(null);
  const [ativando, setAtivando] = useState<CriaturaEmCampo | null>(null);
  const [escolhendoElemento, setEscolhendoElemento] = useState<{
    origemUid: string;
    habilidadeId: string;
    opcoes: Elemento[];
  } | null>(null);

  if (!visao) return null;
  const meuLado = visao.lado;
  const ladoInimigo = ladoOposto(meuLado);
  const eu = visao.eu;
  const oponente = visao.oponente;
  const minhaVez =
    visao.ladoAtivo === meuLado &&
    !visao.pendencia &&
    !visao.aguardandoOponente &&
    visao.fase !== 'mulligan' &&
    !visao.vencedor;
  const pendencia = visao.pendencia;

  function limparSelecao() {
    setSelecaoDaMao(null);
    setModoDeAlvo(null);
    setSubstituindo(null);
    setAtivando(null);
    setEscolhendoElemento(null);
  }

  function despachar(comando: Parameters<typeof enviar>[0]) {
    enviar(comando);
    limparSelecao();
  }

  function jogarDaMao(uid: string, carta: CartaDoCatalogo) {
    if (carta.tipo === 'criatura') {
      // Leviathan de Esdras: não é invocável normalmente, ativa-se da mão
      const daMao = (carta.activatedAbilities ?? []).find((h) => h.source === 'hand');
      if (daMao && carta.summonRule?.normal === false) {
        despachar({ tipo: 'ATIVAR_HABILIDADE', lado: meuLado, origemUid: uid, habilidadeId: daMao.id });
        return;
      }
      setModoDeAlvo({ tipo: 'invocar', uidCarta: uid });
    } else if (carta.tipo === 'habilidade' || carta.tipo === 'item') {
      setModoDeAlvo({ tipo: 'anexar', uidCarta: uid });
    } else if (carta.tipo === 'cenario') {
      despachar({ tipo: 'JOGAR_CENARIO', lado: meuLado, uidCarta: uid });
    } else if (carta.tipo === 'comando') {
      const precisaDeAlvo = (carta.effects ?? []).find(
        (efeito) =>
          'target' in efeito &&
          (efeito.target === 'enemy_creature' || efeito.target === 'your_creature'),
      );
      if (!precisaDeAlvo) {
        despachar({ tipo: 'JOGAR_COMANDO', lado: meuLado, uidCarta: uid });
        return;
      }
      const ladoDoAlvo =
        'target' in precisaDeAlvo && precisaDeAlvo.target === 'enemy_creature'
          ? ladoInimigo
          : meuLado;
      setModoDeAlvo({ tipo: 'comando', uidCarta: uid, ladoDoAlvo });
    }
  }

  function cliqueNoMeuSlot(slot: number) {
    if (!modoDeAlvo) {
      const criatura = eu.campo[slot];
      if (!criatura) return;
      if (visao!.fase === 'batalha' && minhaVez) {
        enviar({ tipo: 'ATACAR', lado: meuLado, slot });
        return;
      }
      if (visao!.fase === 'principal' && minhaVez) setAtivando(criatura);
      return;
    }
    if (modoDeAlvo.tipo === 'invocar') {
      despachar({ tipo: 'INVOCAR', lado: meuLado, uidCarta: modoDeAlvo.uidCarta, slot });
      return;
    }
    if (modoDeAlvo.tipo === 'anexar') {
      const criatura = eu.campo[slot];
      if (!criatura) return;
      if (criatura.anexos.length >= 2) {
        setSubstituindo({ uidCarta: modoDeAlvo.uidCarta, slot });
        setModoDeAlvo(null);
        return;
      }
      despachar({ tipo: 'ANEXAR', lado: meuLado, uidCarta: modoDeAlvo.uidCarta, slot });
      return;
    }
    if (modoDeAlvo.tipo === 'comando' && modoDeAlvo.ladoDoAlvo === meuLado) {
      despachar({
        tipo: 'JOGAR_COMANDO',
        lado: meuLado,
        uidCarta: modoDeAlvo.uidCarta,
        alvo: { lado: meuLado, slot },
      });
    }
  }

  function cliqueNoSlotInimigo(slot: number) {
    if (modoDeAlvo?.tipo === 'comando' && modoDeAlvo.ladoDoAlvo === ladoInimigo) {
      despachar({
        tipo: 'JOGAR_COMANDO',
        lado: meuLado,
        uidCarta: modoDeAlvo.uidCarta,
        alvo: { lado: ladoInimigo, slot },
      });
    }
  }

  const cartaSelecionada = selecaoDaMao
    ? eu.mao.find((naMao) => naMao.uid === selecaoDaMao)
    : undefined;

  return (
    <div className="mx-auto flex max-w-7xl gap-4 p-4">
      <div className="flex-1">
        <PainelDoJogador
          rotulo={`${apelidoOponente} — ${heroiPorChave(oponente.heroi)?.nome ?? oponente.heroi}`}
          pontos={oponente.pontos}
          danoDireto={oponente.danoDireto}
          deck={oponente.deckQuantidade}
          mao={oponente.maoQuantidade}
          descarte={oponente.descarte.length}
          ativo={visao.ladoAtivo === ladoInimigo}
        />
        <div className="flex items-start gap-3">
          <ColunaDeZonas
            deckQuantidade={oponente.deckQuantidade}
            descarte={oponente.descarte}
            cenario={oponente.cenario}
            aoVerDescarte={() => setVendoDescarte('oponente')}
          />
          <div className="min-w-0 flex-1">
            <FileiraDeCampo
              campo={oponente.campo}
              onClickSlot={cliqueNoSlotInimigo}
              destacar={modoDeAlvo?.tipo === 'comando' && modoDeAlvo.ladoDoAlvo === ladoInimigo}
            />
          </div>
        </div>

        <div className="my-2 border-y border-slate-800 py-2">
          {prazoEmMs !== null && !visao.vencedor && (
            <Fusivel
              prazoEmMs={prazoEmMs}
              totalEmS={visao.pendencia?.reacao ? SEGUNDOS_DE_REACAO : SEGUNDOS_DO_TURNO}
            />
          )}
          <div className="flex items-center justify-center gap-3 text-sm">
          <span className="font-bold uppercase tracking-wide text-slate-300">
            Turno {visao.turno} —{' '}
            {visao.fase === 'principal' ? 'Principal' : visao.fase === 'batalha' ? 'Batalha' : 'Mulligan'}
          </span>
          {visao.aguardandoOponente && (
            <span className="text-amber-300">o oponente está decidindo…</span>
          )}
          {minhaVez && visao.fase === 'principal' && (
            <button
              type="button"
              className="rounded bg-red-900 px-3 py-1 font-bold hover:bg-red-800"
              onClick={() => enviar({ tipo: 'AVANCAR_FASE', lado: meuLado })}
            >
              BATALHA
            </button>
          )}
          {minhaVez && (
            <button
              type="button"
              className="rounded bg-slate-700 px-3 py-1 font-bold hover:bg-slate-600"
              onClick={() => despachar({ tipo: 'ENCERRAR_TURNO', lado: meuLado })}
            >
              FIM DE TURNO
            </button>
          )}
          <button
            type="button"
            className="rounded bg-slate-800 px-3 py-1 text-slate-400 hover:bg-slate-700"
            onClick={() => enviar({ tipo: 'CONCEDER', lado: meuLado })}
          >
            Desistir
          </button>
          </div>
        </div>

        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <FileiraDeCampo
              campo={eu.campo}
              onClickSlot={cliqueNoMeuSlot}
              destacar={
                modoDeAlvo?.tipo === 'invocar' ||
                modoDeAlvo?.tipo === 'anexar' ||
                (modoDeAlvo?.tipo === 'comando' && modoDeAlvo.ladoDoAlvo === meuLado)
              }
              podeAtacarAgora={(criatura, slot) => {
                if (!minhaVez || !podeAtacarNaVisao(visao, criatura)) return false;
                const defensor = oponente.campo[slot];
                return !defensor || podeSerAlvoDeAtaque(visao.turno, defensor, criatura, eu.campo);
              }}
            />
          </div>
          <ColunaDeZonas
            deckQuantidade={eu.deckQuantidade}
            descarte={eu.descarte}
            cenario={eu.cenario}
            aoVerDescarte={() => setVendoDescarte('eu')}
          />
        </div>
        <PainelDoJogador
          rotulo={`Você — ${heroiPorChave(eu.heroi)?.nome ?? eu.heroi}`}
          pontos={eu.pontos}
          danoDireto={eu.danoDireto}
          deck={eu.deckQuantidade}
          mao={eu.mao.length}
          descarte={eu.descarte.length}
          ativo={visao.ladoAtivo === meuLado}
        />

        <div className="mt-3 flex min-h-36 flex-wrap items-start gap-2">
          {eu.mao.map((naMao) => {
            const carta = cartaPorId(naMao.cartaId);
            const selecionada = selecaoDaMao === naMao.uid;
            return (
              <div key={naMao.uid} className="w-24">
                <button
                  type="button"
                  onClick={() => {
                    if (!minhaVez || visao.fase !== 'principal') return;
                    setSelecaoDaMao(selecionada ? null : naMao.uid);
                    setModoDeAlvo(null);
                  }}
                  className="block w-full"
                >
                  <CartaImagem
                    cartaId={naMao.cartaId}
                    className={`w-full rounded transition-transform hover:-translate-y-1 ${
                      selecionada ? 'ring-2 ring-amber-400' : ''
                    }`}
                  />
                </button>
                {selecionada && (
                  <button
                    type="button"
                    className="mt-1 w-full rounded bg-emerald-800 px-1 py-0.5 text-xs font-bold hover:bg-emerald-700"
                    onClick={() => jogarDaMao(naMao.uid, carta)}
                  >
                    {carta.tipo === 'criatura'
                      ? 'INVOCAR'
                      : carta.tipo === 'comando'
                        ? 'JOGAR'
                        : carta.tipo === 'cenario'
                          ? 'ATIVAR'
                          : 'ANEXAR'}
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <p className="mt-1 text-xs text-slate-600">
          clique direito em qualquer carta para ampliá-la e ler o efeito
        </p>
        {ultimaRecusa && <p className="mt-2 text-sm text-amber-400">{ultimaRecusa}</p>}
        {modoDeAlvo && (
          <p className="mt-2 text-sm text-sky-300">
            Escolha o destino no campo destacado — ou{' '}
            <button type="button" className="underline" onClick={limparSelecao}>
              cancele
            </button>
            .
          </p>
        )}
        {cartaSelecionada && (
          <p className="mt-1 text-xs text-slate-400">
            {cartaPorId(cartaSelecionada.cartaId).efeito ?? 'Sem efeito.'}
          </p>
        )}
      </div>

      <aside className="w-64 shrink-0 rounded border border-slate-800 bg-slate-900/60 p-2 text-xs leading-5 text-slate-300">
        <h2 className="mb-1 font-bold uppercase tracking-wide text-slate-400">Registro</h2>
        <ol className="flex max-h-[80vh] flex-col-reverse overflow-y-auto">
          {[...registro].reverse().map((linha, i) => (
            <li key={registro.length - i}>{linha}</li>
          ))}
        </ol>
      </aside>

      {visao.fase === 'mulligan' && !eu.mulliganDecidido && !visao.vencedor && (
        <Modal titulo="Mulligan">
          <p className="mb-3 text-sm text-slate-300">
            Manter a mão inicial ou trocar por 5 novas cartas?
          </p>
          <div className="mb-3 flex gap-2">
            {eu.mao.map((naMao) => (
              <CartaImagem key={naMao.uid} cartaId={naMao.cartaId} className="w-20 rounded" />
            ))}
          </div>
          <div className="flex justify-center gap-3">
            <BotaoModal onClick={() => enviar({ tipo: 'DECIDIR_MULLIGAN', lado: meuLado, trocar: false })}>
              MANTER
            </BotaoModal>
            <BotaoModal
              tom="ambar"
              onClick={() => enviar({ tipo: 'DECIDIR_MULLIGAN', lado: meuLado, trocar: true })}
            >
              TROCAR
            </BotaoModal>
          </div>
        </Modal>
      )}

      {pendencia && (
        <Modal titulo={pendencia.titulo}>
          {pendencia.reacao && prazoEmMs !== null && <ContagemDeReacao prazoEmMs={prazoEmMs} />}
          <div className="flex flex-wrap items-center justify-center gap-2">
            {pendencia.opcoes.map((opcao) => {
              const naMao = eu.mao.find((carta) => carta.uid === opcao.id);
              const responderCom = () =>
                enviar({ tipo: 'RESPONDER', lado: meuLado, pendenciaId: pendencia.id, opcaoId: opcao.id });
              if (naMao) {
                return (
                  <button
                    key={opcao.id}
                    type="button"
                    className="w-24 rounded transition-transform hover:-translate-y-1 hover:ring-2 hover:ring-amber-400"
                    onClick={responderCom}
                  >
                    <CartaImagem cartaId={naMao.cartaId} />
                  </button>
                );
              }
              return (
                <BotaoModal key={opcao.id} onClick={responderCom}>
                  {opcao.rotulo}
                </BotaoModal>
              );
            })}
            {pendencia.podeRecusar && (
              <BotaoModal
                tom="cinza"
                onClick={() =>
                  enviar({
                    tipo: 'RESPONDER',
                    lado: meuLado,
                    pendenciaId: pendencia.id,
                    opcaoId: 'recusar',
                  })
                }
              >
                Recusar
              </BotaoModal>
            )}
          </div>
        </Modal>
      )}

      {vendoDescarte && (
        <Modal titulo={vendoDescarte === 'eu' ? 'Seu descarte' : 'Descarte do oponente'}>
          {(vendoDescarte === 'eu' ? eu.descarte : oponente.descarte).length ? (
            <div className="flex max-h-[60vh] max-w-xl flex-wrap justify-center gap-2 overflow-y-auto">
              {[...(vendoDescarte === 'eu' ? eu.descarte : oponente.descarte)]
                .reverse()
                .map((carta) => (
                  <CartaImagem key={carta.uid} cartaId={carta.cartaId} className="w-20 rounded" />
                ))}
            </div>
          ) : (
            <p className="text-center text-sm text-slate-400">O descarte está vazio.</p>
          )}
          <p className="mt-2 text-center text-xs text-slate-500">
            a carta mais recente aparece primeiro — clique direito amplia
          </p>
          <div className="mt-3 flex justify-center">
            <BotaoModal tom="cinza" onClick={() => setVendoDescarte(null)}>
              Fechar
            </BotaoModal>
          </div>
        </Modal>
      )}

      {substituindo && (
        <Modal titulo="A criatura já tem 2 anexos — substituir qual?">
          <div className="flex justify-center gap-3">
            {eu.campo[substituindo.slot]?.anexos.map((anexo) => (
              <button
                key={anexo.uid}
                type="button"
                className="w-24"
                onClick={() =>
                  despachar({
                    tipo: 'ANEXAR',
                    lado: meuLado,
                    uidCarta: substituindo.uidCarta,
                    slot: substituindo.slot,
                    substituirAnexoUid: anexo.uid,
                  })
                }
              >
                <CartaImagem cartaId={anexo.cartaId} />
              </button>
            ))}
            <BotaoModal tom="cinza" onClick={limparSelecao}>
              Cancelar
            </BotaoModal>
          </div>
        </Modal>
      )}

      {ativando && (
        <Modal titulo="Criatura">
          <PainelDeAtivacao
            criatura={ativando}
            aoAtivar={(origemUid, habilidadeId, elementos) => {
              if (elementos) {
                setEscolhendoElemento({ origemUid, habilidadeId, opcoes: elementos });
                setAtivando(null);
                return;
              }
              despachar({ tipo: 'ATIVAR_HABILIDADE', lado: meuLado, origemUid, habilidadeId });
            }}
            aoFechar={limparSelecao}
          />
        </Modal>
      )}

      {escolhendoElemento && (
        <Modal titulo="Escolha o elemento">
          <div className="flex flex-wrap justify-center gap-2">
            {escolhendoElemento.opcoes.map((elemento) => (
              <BotaoModal
                key={elemento}
                onClick={() =>
                  despachar({
                    tipo: 'ATIVAR_HABILIDADE',
                    lado: meuLado,
                    origemUid: escolhendoElemento.origemUid,
                    habilidadeId: escolhendoElemento.habilidadeId,
                    elemento,
                  })
                }
              >
                {elemento}
              </BotaoModal>
            ))}
            <BotaoModal tom="cinza" onClick={limparSelecao}>
              Cancelar
            </BotaoModal>
          </div>
        </Modal>
      )}

      {visao.vencedor && (
        <Modal titulo={visao.vencedor === meuLado ? 'VITÓRIA!' : 'Derrota'}>
          <p className="mb-4 text-center text-sm text-slate-300">
            {visao.motivoDoFim === 'pontos'
              ? 'Por pontos.'
              : visao.motivoDoFim === 'desistencia'
                ? 'Por desistência.'
                : 'Por tempo (W.O.).'}
          </p>
          <div className="flex justify-center gap-3">
            {modo === 'treino' && <BotaoModal onClick={() => iniciarTreino()}>Jogar de novo</BotaoModal>}
            <BotaoModal tom="cinza" onClick={sair}>
              Menu
            </BotaoModal>
          </div>
        </Modal>
      )}
    </div>
  );
}

function useRestante(prazoEmMs: number): number {
  const [restante, setRestante] = useState(() => Math.max(0, prazoEmMs - Date.now()));
  useEffect(() => {
    setRestante(Math.max(0, prazoEmMs - Date.now()));
    const intervalo = setInterval(() => setRestante(Math.max(0, prazoEmMs - Date.now())), 250);
    return () => clearInterval(intervalo);
  }, [prazoEmMs]);
  return restante;
}

/** O "fusível" do legado: barra que queima da esquerda para a direita. */
function Fusivel({ prazoEmMs, totalEmS }: { prazoEmMs: number; totalEmS: number }) {
  const restante = useRestante(prazoEmMs);
  const segundos = Math.ceil(restante / 1000);
  const fracao = Math.max(0, Math.min(1, restante / (totalEmS * 1000)));
  const cor = fracao > 0.4 ? 'bg-lime-400' : fracao > 0.2 ? 'bg-amber-400' : 'bg-red-500';
  return (
    <div className="mb-2 flex items-center gap-2 text-xs">
      <span
        className={`w-12 text-right font-bold tabular-nums ${
          fracao > 0.2 ? 'text-slate-400' : 'text-red-400'
        }`}
      >
        ⏱ {segundos}s
      </span>
      <div className="h-1.5 flex-1 overflow-hidden rounded bg-slate-800">
        <div
          className={`h-full rounded transition-[width] duration-200 ease-linear ${cor}`}
          style={{ width: `${fracao * 100}%` }}
        />
      </div>
    </div>
  );
}

function ContagemDeReacao({ prazoEmMs }: { prazoEmMs: number }) {
  const restante = useRestante(prazoEmMs);
  return (
    <p className="mb-3 text-center text-lg font-bold tabular-nums text-amber-300">
      {Math.max(0, Math.ceil(restante / 1000))}s
    </p>
  );
}

function ColunaDeZonas({
  deckQuantidade,
  descarte,
  cenario,
  aoVerDescarte,
}: {
  deckQuantidade: number;
  descarte: readonly CartaNaZona[];
  cenario: CartaNaZona | null;
  aoVerDescarte: () => void;
}) {
  const topoDoDescarte = descarte[descarte.length - 1];
  return (
    <div className="my-2 flex w-14 shrink-0 flex-col gap-1 text-center text-[9px] font-bold uppercase tracking-wide text-slate-500">
      <div>
        <div className="relative">
          <img
            src="/assets/img/cover.png"
            alt="Deck"
            draggable={false}
            className={`w-full rounded ${deckQuantidade ? '' : 'opacity-25 grayscale'}`}
          />
          <Contagem valor={deckQuantidade} />
        </div>
        Deck
      </div>
      <div>
        <button
          type="button"
          onClick={aoVerDescarte}
          title="Ver as cartas do descarte"
          className="relative block w-full rounded hover:ring-2 hover:ring-sky-500"
        >
          {topoDoDescarte ? (
            <CartaImagem cartaId={topoDoDescarte.cartaId} className="w-full rounded" />
          ) : (
            <div className="aspect-[63/88] w-full rounded border border-dashed border-slate-700" />
          )}
          <Contagem valor={descarte.length} />
        </button>
        Descarte
      </div>
      <div>
        {cenario ? (
          <CartaImagem cartaId={cenario.cartaId} className="w-full rounded ring-1 ring-emerald-700" />
        ) : (
          <div className="flex aspect-[63/88] w-full items-center justify-center rounded border border-dashed border-emerald-900/80 text-emerald-800">
            ∅
          </div>
        )}
        Cenário
      </div>
    </div>
  );
}

function Contagem({ valor }: { valor: number }) {
  return (
    <span className="absolute -bottom-1 -right-1 rounded-full bg-slate-950 px-1.5 text-[10px] font-bold text-slate-200 ring-1 ring-slate-600">
      {valor}
    </span>
  );
}

function FileiraDeCampo({
  campo,
  onClickSlot,
  destacar,
  podeAtacarAgora,
}: {
  campo: readonly (CriaturaEmCampo | null)[];
  onClickSlot: (slot: number) => void;
  destacar?: boolean;
  podeAtacarAgora?: (criatura: CriaturaEmCampo, slot: number) => boolean;
}) {
  return (
    <div className="my-2 grid grid-cols-5 gap-2">
      {campo.map((criatura, slot) => (
        <div
          key={slot}
          className={`aspect-[63/88] rounded border ${
            destacar ? 'border-amber-400/70' : 'border-slate-800'
          } bg-slate-900/40 p-1`}
        >
          {criatura ? (
            <div className="relative">
              <CriaturaNoCampo criatura={criatura} campo={campo} onClick={() => onClickSlot(slot)} />
              {podeAtacarAgora?.(criatura, slot) && (
                <span className="absolute -top-2 left-1/2 -translate-x-1/2 rounded bg-red-800 px-1 text-[10px] font-bold">
                  ⚔ ATACAR
                </span>
              )}
            </div>
          ) : (
            <button
              type="button"
              className="h-full w-full rounded text-slate-700 hover:bg-slate-800/50"
              onClick={() => onClickSlot(slot)}
            >
              {slot + 1}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

function PainelDoJogador({
  rotulo,
  pontos,
  danoDireto,
  deck,
  mao,
  descarte,
  ativo,
}: {
  rotulo: string;
  pontos: number;
  danoDireto: number;
  deck: number;
  mao: number;
  descarte: number;
  ativo: boolean;
}) {
  return (
    <div className="flex items-center gap-4 text-sm">
      <span className={`font-bold ${ativo ? 'text-emerald-400' : 'text-slate-400'}`}>{rotulo}</span>
      <span title="pontos (3 vencem)">
        {'●'.repeat(pontos)}
        {'○'.repeat(Math.max(0, 3 - pontos))}
      </span>
      <span className="text-slate-400">Dano {danoDireto}/5</span>
      <span className="text-slate-500">
        Mão {mao} · Deck {deck} · Descarte {descarte}
      </span>
    </div>
  );
}

function PainelDeAtivacao({
  criatura,
  aoAtivar,
  aoFechar,
}: {
  criatura: CriaturaEmCampo;
  aoAtivar: (origemUid: string, habilidadeId: string, elementos?: Elemento[]) => void;
  aoFechar: () => void;
}) {
  const opcoes: { origemUid: string; habilidadeId: string; rotulo: string; elementos?: Elemento[] }[] = [];

  if (criatura.cartaId !== null) {
    const carta = cartaPorId(criatura.cartaId);
    if (carta.tipo === 'criatura') {
      for (const habilidade of carta.activatedAbilities ?? []) {
        if (habilidade.source !== 'field_creature') continue;
        opcoes.push({ origemUid: criatura.uid, habilidadeId: habilidade.id, rotulo: carta.nome });
      }
    }
  }
  for (const anexo of criatura.anexos) {
    const carta = cartaPorId(anexo.cartaId);
    if (carta.tipo !== 'item') continue;
    for (const habilidade of carta.activatedAbilities ?? []) {
      opcoes.push({
        origemUid: anexo.uid,
        habilidadeId: habilidade.id,
        rotulo: carta.nome,
        ...(habilidade.action.type === 'change_element' ? { elementos: habilidade.action.choose } : {}),
      });
    }
  }

  if (!opcoes.length) {
    return (
      <div className="text-center">
        <p className="mb-3 text-sm text-slate-300">Esta criatura não tem habilidade ativável.</p>
        <BotaoModal tom="cinza" onClick={aoFechar}>
          Fechar
        </BotaoModal>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-2">
      {opcoes.map((opcao) => (
        <BotaoModal
          key={`${opcao.origemUid}:${opcao.habilidadeId}`}
          onClick={() => aoAtivar(opcao.origemUid, opcao.habilidadeId, opcao.elementos)}
        >
          Ativar: {opcao.rotulo}
        </BotaoModal>
      ))}
      <BotaoModal tom="cinza" onClick={aoFechar}>
        Cancelar
      </BotaoModal>
    </div>
  );
}

function Modal({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="max-w-2xl rounded-lg border border-emerald-700 bg-slate-900 p-5 shadow-xl">
        <h2 className="mb-4 text-center text-lg font-bold">{titulo}</h2>
        {children}
      </div>
    </div>
  );
}

function BotaoModal({
  children,
  onClick,
  tom = 'verde',
}: {
  children: React.ReactNode;
  onClick: () => void;
  tom?: 'verde' | 'ambar' | 'cinza';
}) {
  const cores =
    tom === 'verde'
      ? 'bg-emerald-800 hover:bg-emerald-700'
      : tom === 'ambar'
        ? 'bg-amber-800 hover:bg-amber-700'
        : 'bg-slate-700 hover:bg-slate-600';
  return (
    <button type="button" onClick={onClick} className={`rounded px-4 py-2 text-sm font-bold ${cores}`}>
      {children}
    </button>
  );
}
