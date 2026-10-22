// The editor's Analysis tab: what to compare against, a status line while it
// works, and the estimated competitive profile (tier, strengths and
// weaknesses, a stat radar, percentiles, score dials, CAP rating, matchups).
// The numbers come from js/features/analysis.ts; the charts are
// components/charts.tsx.

import { api } from '../../../core/app.ts';
import { Icon } from '../Icon.tsx';
import { Gauge, PercentileRows, Radar } from '../charts.tsx';

/** The results' shape while they load: the same cards, charts and dials, empty. */
function Skeleton() {
    const line = (width: string | number, height = 10, extra: React.CSSProperties = {}) =>
        <div className="skel skel-text" style={{ width, height, ...extra }} />;
    const head = (w: string) => <>{line(w, 15, { marginBottom: 8 })}{line('75%', 10, { marginBottom: 14 })}</>;
    const matchupCards = [0, 1, 2, 3].map(i => (
        <div key={i} className="analysis-matchup-card skel-card">
            <div className="analysis-matchup-icon skel" />
            <div className="analysis-matchup-info"><span className="skel skel-text" style={{ width: '80%' }} /><span className="skel skel-text" style={{ width: '60%', height: 9 }} /></div>
        </div>
    ));
    const strength = (widths: string[]) => (
        <div className="analysis-card panel-lite analysis-strength-card skel-card">
            {line('45%', 15, { marginBottom: 12 })}
            {widths.map((w, i) => <div key={i} className="skel skel-text" style={{ width: w }} />)}
        </div>
    );
    const combo = (
        <div className="analysis-stat-combo">
            {[0, 1, 2, 3, 4].map(i => <div key={i}>{line('70%', 9)}{line('50%', 14, { marginTop: 6 })}</div>)}
        </div>
    );
    return (
        <div role="status" aria-busy="true" aria-label="Loading the analysis">
            <div className="analysis-profile panel-lite skel-card">
                <div className="analysis-profile-main">
                    {line('60%', 11, { marginBottom: 10 })}
                    {line('80%', 42, { margin: '6px 0 8px' })}
                    {line('70%', 12)}
                </div>
                <div className="analysis-profile-summary">
                    <div className="analysis-discord-message">
                        <span className="analysis-discord-avatar skel skel-circle" />
                        <div className="analysis-discord-body">
                            {line(80, 10, { marginBottom: 8 })}
                            {line('100%')}
                            {line('85%')}
                        </div>
                    </div>
                </div>
                {line('90%', 11)}
            </div>
            <div className="analysis-two-col analysis-strength-row">{strength(['95%', '88%', '70%'])}{strength(['92%', '80%', '65%'])}</div>
            <div className="analysis-two-col analysis-chart-row">
                <div className="analysis-card panel-lite skel-card">
                    {head('35%')}
                    <div className="skel skel-radar" />
                </div>
                <div className="analysis-card panel-lite skel-card">
                    {head('40%')}
                    {[62, 48, 80, 35, 55].map((w, i) => (
                        <div key={i} className="chart-pct-row">
                            {line('80%', 10)}
                            <span className="chart-pct-track"><span className="skel skel-pct-fill" style={{ width: `${w}%` }} /></span>
                            {line('100%', 10)}
                        </div>
                    ))}
                </div>
            </div>
            <div className="analysis-dials">
                {[0, 1, 2, 3].map(i => (
                    <div key={i} className="analysis-dial skel-card">
                        <div className="chart-gauge">
                            <div className="skel skel-gauge" />
                            {line(70, 11, { marginTop: 12 })}
                            {line(100, 9, { marginTop: 6 })}
                        </div>
                    </div>
                ))}
            </div>
            <div className="analysis-two-col">
                <div className="analysis-card panel-lite skel-card">{head('45%')}{combo}</div>
                <div className="analysis-card panel-lite skel-card">{head('50%')}{combo}</div>
            </div>
            <div className="analysis-card panel-lite analysis-matchups-card skel-card">
                <div className="analysis-matchups-header">
                    <div>{line(160, 15, { marginBottom: 8 })}{line(220)}</div>
                    <div className="analysis-matchups-score">{line(40, 9)}{line(34, 16)}</div>
                </div>
                <div className="analysis-matchup-columns">
                    <div className="analysis-matchup-group favorable"><h4><span><Icon name="check" size={14} /></span> Looks good into</h4><div className="analysis-matchup-list">{matchupCards}</div></div>
                    <div className="analysis-matchup-group unfavorable"><h4><span><Icon name="x" size={14} /></span> Looks rough into</h4><div className="analysis-matchup-list">{matchupCards}</div></div>
                </div>
            </div>
        </div>
    );
}

function Types({ types }: { types: string[] }) {
    if (!types.length) return <span>None</span>;
    return <>{types.map((t, i) => <span key={t}>{i ? ' ' : ''}<span className={`type-pill type-${t.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}>{t}</span></span>)}</>;
}

function Matchups({ rows, empty }: { rows: any[]; empty: string }) {
    if (!rows.length) return <div className="analysis-muted">{empty}</div>;
    return (
        <>
            {rows.map(x => (
                <div key={x.name} className="analysis-matchup-card">
                    <div className="analysis-matchup-icon">
                        <img src={x.sprite.src} alt="" loading="lazy" onError={e => { const img = e.currentTarget; if (img.src !== x.sprite.fallback) img.src = x.sprite.fallback; }} />
                    </div>
                    <div className="analysis-matchup-info">
                        <strong>{x.name}</strong><span>{x.scenario}</span>
                        <i className="analysis-matchup-meter" aria-hidden="true"><i style={{ width: `${Math.max(0, Math.min(100, x.score))}%` }} /></i>
                    </div>
                    <b className="analysis-matchup-score">{x.score}</b>
                </div>
            ))}
        </>
    );
}

const STAT_AXES = ['HP', 'Atk', 'Def', 'SpA', 'SpD', 'Spe'];

/** The four 0-100 scores side by side, each its own small dial. */
function ScoreDials({ c }: { c: any }) {
    const dials: Array<[string, number, string]> = [
        ['Stat spread', c.statCombination, 'How well the stats work together'],
        ['Role value', c.roleScore, 'How clear and useful its job is'],
        ['Kit ceiling', c.kit, 'Stats, typing, ability and moves together'],
        ['Matchups', c.matchups ?? 50, 'Against the Pokémon it would meet']
    ];
    return (
        <div className="analysis-dials">
            {dials.map(([label, v, caption]) => (
                <div key={label} className="analysis-dial">
                    <Gauge value={Number(v) || 0} label={label} caption={<><b>{label}</b><span>{caption}</span></>} />
                </div>
            ))}
        </div>
    );
}

function Results({ r }: { r: any }) {
    const c = r.charts;
    const combo = (items: Array<[string, string | number]>) => (
        <div className="analysis-stat-combo">{items.map(([label, value]) => <div key={label}><span>{label}</span><b>{value}</b></div>)}</div>
    );
    return (
        <>
            <div className="analysis-profile panel-lite">
                <div className="analysis-profile-main">
                    <div className="analysis-kicker">Estimated competitive profile</div>
                    <div className="analysis-profile-tier">{r.tier}</div>
                    <div className="analysis-score">{r.score}/100 · {r.reliability}% confidence</div>
                </div>
                <div className="analysis-profile-summary">
                    <div className="analysis-discord-message">
                        <img className="analysis-discord-avatar" src="assets/inoue_profile.gif" alt="Inoue" />
                        <div className="analysis-discord-body"><div className="analysis-discord-name">Inoue</div><div className="analysis-discord-text">{r.summary}</div></div>
                    </div>
                </div>
                <div className="analysis-profile-note"><strong>Take it with a grain of salt.</strong> This is an estimate, not an official competitive ranking.</div>
            </div>

            <div className="analysis-two-col analysis-strength-row">
                <div className="analysis-card panel-lite analysis-strength-card">
                    <h3><span className="analysis-section-icon analysis-positive"><Icon name="arrow-up" size={14} /></span>Strengths</h3>
                    <ul>{(r.strengths.length ? r.strengths : ['No major strength crossed the current thresholds.']).map((x: string) => <li key={x}>{x}</li>)}</ul>
                </div>
                <div className="analysis-card panel-lite analysis-strength-card">
                    <h3><span className="analysis-section-icon analysis-negative"><Icon name="arrow-down" size={14} /></span>Weaknesses</h3>
                    <ul>{(r.weaknesses.length ? r.weaknesses : ['No major weakness crossed the current thresholds.']).map((x: string) => <li key={x}>{x}</li>)}</ul>
                </div>
            </div>

            {c && (
                <div className="analysis-two-col analysis-chart-row">
                    <div className="analysis-card panel-lite">
                        <h3>Stat spread</h3>
                        <p className="analysis-card-help">Its base stats against the average of the comparison pool.</p>
                        <Radar label="Base stats against the pool average" axes={STAT_AXES} max={Math.max(150, ...c.stats, ...c.poolAvg)}
                            series={[{ name: r.name || 'This Fakémon', kind: 'main', values: c.stats }, { name: 'Pool average', kind: 'ref', values: c.poolAvg }]} />
                    </div>
                    <div className="analysis-card panel-lite">
                        <h3>Where it ranks</h3>
                        <p className="analysis-card-help">Percentile in the pool. Higher is better. The hollow dot is the usage-weighted metagame.</p>
                        <PercentileRows label="Percentiles" mainName="Pool" refName="Metagame" rows={[
                            { label: 'Bulk', value: c.pct.bulk, compare: c.meta.bulk },
                            { label: 'Offense', value: c.pct.offense, compare: c.meta.offense },
                            { label: 'Speed', value: c.pct.speed, compare: c.meta.speed },
                            { label: 'Typing', value: c.pct.typing, compare: c.meta.typing },
                            { label: 'BST', value: c.pct.bst }
                        ]} />
                        <p className="analysis-card-foot"><span className="analysis-type-list"><Types types={r.types} /></span> · {r.typing.weak} weaknesses · {r.typing.resist} resistances · {r.typing.immune} immunities{r.tools.length ? ` · ${r.tools.join(', ')}` : ''}</p>
                    </div>
                </div>
            )}

            {c && <ScoreDials c={c} />}

            <div className="analysis-two-col">
                <div className="analysis-card panel-lite">
                    <h3>Selected environment</h3>
                    <p><strong>{r.selectedFormat}</strong> · {r.metagameCount} usage-weighted Pokémon</p>
                    {combo([['Stat profile', r.metagame.stat], ['Bulk', r.metagame.bulk], ['Offense', r.metagame.offense], ['Speed', r.metagame.speed], ['Matchups', r.metagame.matchups]])}
                </div>
                <div className="analysis-card panel-lite">
                    <h3>CAP stat rating <span className="analysis-inline-big">{r.cap.BSR}</span></h3>
                    <p>{r.cap.category} · CAP's nonlinear stat rating. A stat-power measure, not a tier.</p>
                    {combo([['PT', r.cap.PT], ['ST', r.cap.ST], ['PS', r.cap.PS], ['SS', r.cap.SS], ['ODB', r.cap.ODB], ['PSB', r.cap.PSB]])}
                </div>
            </div>

            <div className="analysis-card panel-lite analysis-matchups-card">
                <div className="analysis-matchups-header">
                    <div>
                        <h3>Metagame matchups</h3>
                        <p>{r.usingComparableTier ? `Weighted matchups against ${r.tier} Pokémon. It's not a perfect tool. Use common sense.` : 'Using the selected environment because there were not enough same-tier Pokémon to make a useful sample.'}</p>
                    </div>
                    <div className="analysis-matchups-score"><span>Overall</span><b>{r.metagame.matchups}</b></div>
                </div>
                <div className="analysis-matchup-columns">
                    <div className="analysis-matchup-group favorable">
                        <h4><span><Icon name="check" size={14} /></span> Looks good into</h4>
                        <div className="analysis-matchup-list"><Matchups rows={r.good} empty="No clear favorable matchups." /></div>
                    </div>
                    <div className="analysis-matchup-group unfavorable">
                        <h4><span><Icon name="x" size={14} /></span> Looks rough into</h4>
                        <div className="analysis-matchup-list"><Matchups rows={r.bad} empty="No clear unfavorable matchups." /></div>
                    </div>
                </div>
            </div>
        </>
    );
}

export function AnalysisTab() {
    const cfg = api.getAnalysisCfg();
    const view = api.analysisView();
    const choices = api.analysisChoices(cfg.pool === 'pokemon');
    const set = (patch: object) => api.setAnalysisCfg(patch);
    return (
        <div className="analysis-shell">
            <div className="analysis-controls panel-lite">
                <div className="analysis-control">
                    <label>Compare Against</label>
                    <select value={cfg.pool} onChange={e => set({ pool: e.target.value })}>
                        <option value="generation">Generation</option>
                        <option value="pokemon">Single Pokémon</option>
                        <option value="collection">My Collection</option>
                        <option value="folder">Collection Folder</option>
                        {choices.regions.length > 0 && <option value="region">One of my regions</option>}
                    </select>
                </div>
                {cfg.pool === 'region' && (
                    <div className="analysis-control">
                        <label>Region</label>
                        <select value={cfg.region || choices.regions[0]?.id || ''} onChange={e => set({ region: e.target.value })}>
                            {choices.regions.map((r: any) => <option key={r.id} value={r.id}>{r.name}</option>)}
                        </select>
                    </div>
                )}
                {cfg.pool === 'generation' && (
                    <div className="analysis-control">
                        <label>Generation</label>
                        <select value={cfg.gen} onChange={e => set({ gen: Number(e.target.value) })}>
                            {[9, 8, 7, 6, 5, 4, 3, 2, 1].map(g => <option key={g} value={g}>Gen {g}</option>)}
                        </select>
                    </div>
                )}
                {cfg.pool === 'pokemon' && (
                    <div className="analysis-control">
                        <label>Pokémon</label>
                        <select value={cfg.comparePokemon || choices.pokemon[0]?.id || ''} onChange={e => set({ comparePokemon: e.target.value })}>
                            {choices.pokemon.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                    </div>
                )}
                {cfg.pool === 'folder' && (
                    <div className="analysis-control">
                        <label>Folder</label>
                        <select value={cfg.folder || choices.folders[0]?.id || ''} onChange={e => set({ folder: e.target.value })}>
                            {choices.folders.map((f: any) => <option key={f.id} value={f.id}>{f.name}</option>)}
                        </select>
                    </div>
                )}
                {cfg.pool === 'generation' && (
                    <div className="analysis-check"><label><input type="checkbox" checked={cfg.natdex} onChange={e => set({ natdex: e.target.checked })} /> National Dex pool</label></div>
                )}
            </div>
            {/* what it is doing, for screen readers only: the skeleton shows it on screen */}
            <span className="sr-only" role="status">{view.status.kind === 'busy' ? view.status.text : ''}</span>
            <div className="analysis-results">
                {view.error ? <div className="analysis-error panel-lite">{view.error}</div> : view.result ? <Results r={view.result} /> : <Skeleton />}
            </div>
        </div>
    );
}
