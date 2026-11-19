import { GoalOverlayEvent } from '../types/types';

/** Firebot serializes this callback into the overlay. Keep it self-contained. */
export function onGoalOverlayEvent(payload: unknown): void {
    const event = payload as GoalOverlayEvent;
    if (!event) return;
    const runtime = window as any;
    const frames: Map<string, any> = runtime.__msggGoalFrames || (runtime.__msggGoalFrames = new Map());
    const revisions: Map<string, number> = runtime.__msggGoalRevisions || (runtime.__msggGoalRevisions = new Map());
    if (!event.goalId) return;
    const revision = Number.isFinite(event.revision) ? event.revision : 0;
    const previous = frames.get(event.goalId);
    const send = (entry: any) => {
        entry.frame.contentWindow?.postMessage({
            type: 'goalTrackerData', goalId: event.goalId, uuid: entry.uuid, data: entry.data
        }, '*');
    };
    // Updates cannot create displays, replace activations, or revive a hidden goal.
    if (event.type === 'update') {
        if (!previous || previous.uuid !== event.uuid || previous.revision !== revision) return;
        previous.data = event.data;
        if (previous.loaded) send(previous);
        return;
    }
    if (event.type !== 'show' && event.type !== 'remove') return;
    if (revision < (revisions.get(event.goalId) || 0)) return;
    if (event.type === 'remove') {
        revisions.set(event.goalId, revision);
        previous?.frame.remove();
        frames.delete(event.goalId);
        return;
    }
    if (!event.config || !event.uuid) return;
    revisions.set(event.goalId, revision);
    if (previous?.uuid === event.uuid) {
        previous.data = event.data;
        if (previous.loaded) send(previous);
        return;
    }
    previous?.frame.remove();
    const frame = document.createElement('iframe');
    frame.id = `goal-frame-${event.goalId}`;
    frame.title = `Goal ${event.goalId}`;
    frame.setAttribute('sandbox', 'allow-scripts');
    Object.assign(frame.style, {
        position: 'absolute', top: '0', left: '0', width: '100%', height: '100%',
        border: '0', background: 'transparent', pointerEvents: 'none'
    });
    const entry = { frame, uuid: event.uuid, revision, data: event.data, loaded: false };
    frames.set(event.goalId, entry);
    const host = document.getElementById('wrapper') || document.body;
    host.appendChild(frame);
    const config = JSON.parse(JSON.stringify(event.config));
    for (const logo of Object.values(config.content.branding.logo) as any[]) {
        if (logo.src) logo.src = `${window.location.origin}/resource/${encodeURIComponent(logo.src)}`;
    }
    // Escape script delimiters in user-entered titles/templates. Callback replacement preserves $ literals.
    const serialize = (value: unknown) => JSON.stringify(value).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
    fetch(`${window.location.origin}/plugins/goal-tracker/goal-tracker.html`)
        .then(response => { if (!response.ok) throw new Error(`Goal template HTTP ${response.status}`); return response.text(); })
        .then(html => {
            if (frames.get(event.goalId) !== entry) return;
            frame.onload = () => {
                if (frames.get(event.goalId) !== entry) return;
                entry.loaded = true;
                send(entry);
            };
            frame.srcdoc = html.replace('__GOAL_CONFIG__', () => serialize(config))
                .replace('__GOAL_INSTANCE__', () => serialize({ goalId: event.goalId, uuid: event.uuid }));
        }).catch(error => {
            console.error('Goal overlay initialization failed:', error);
            if (frames.get(event.goalId) === entry) { frame.remove(); frames.delete(event.goalId); }
        });
}
