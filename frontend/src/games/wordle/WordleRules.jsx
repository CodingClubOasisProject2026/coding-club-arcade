// Game rules and the shared "How it works" content.
// Used by the landing page and by the "?" pop-up on the game page.
// These mirror backend/wordle/engine.py and views.py. If the backend numbers change, change them here too.
export const HUB_URL = '/';
export const MAX_ATTEMPTS = 6;
export const START_SECONDS = 120;
export const MISS_PENALTY_SECONDS = 20;
export const MISS_PENALTY_POINTS = 20;
export const POINTS_PER_GREEN = 5;
export const SECONDS_PER_GREEN = 5;
export const SOLVE_POINTS = 30;
export const SOLVE_SECONDS = 15;

const formatClockShort = (total) => `${Math.floor(total / 60)} min`;
const RULE_FACTS = [
    { big: formatClockShort(START_SECONDS), text: 'to start. The clock never pauses.' },
    { big: String(MAX_ATTEMPTS), text: 'tries per word, then the next word.' },
];
const RULE_ROWS = [
    { label: 'Every green tile', points: POINTS_PER_GREEN, seconds: SECONDS_PER_GREEN },
    { label: 'Solving a word', note: 'on top', points: SOLVE_POINTS, seconds: SOLVE_SECONDS },
];
const PENALTIES = [
    `Use all ${MAX_ATTEMPTS} guesses without solving a word: −${MISS_PENALTY_POINTS} points and −${MISS_PENALTY_SECONDS}s, then the next word.`,
    'Time reaches zero: the game ends.',
    'Leaving mid-game abandons this attempt.',
];

// Rules + penalties, shared by the "before you start" pop-up and the "?" button.
export function RulesContent({ hideSolveTime = false }) {
    return (
        <>
            <div className="rule-facts">
                {RULE_FACTS.map((fact) => (
                    <div className="rule-fact" key={fact.text}>
                        <strong>{fact.big}</strong>
                        <span>{fact.text}</span>
                    </div>
                ))}
            </div>
            <table className="rules-table">
                <thead>
                    <tr><th>Earn</th><th>Points</th><th>Time</th></tr>
                </thead>
                <tbody>
                    {RULE_ROWS.map((row) => (
                        <tr key={row.label}>
                            <th scope="row">{row.label}{row.note && <small>{row.note}</small>}</th>
                            <td className="pts">+{row.points}</td>
                            <td className="secs">{hideSolveTime && row.note ? '—' : `+${row.seconds}s`}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
            <div className="penalty-box">
                <h3>Penalties</h3>
                <ul className="rules-list">
                    {PENALTIES.map((penalty) => <li key={penalty}>{penalty}</li>)}
                </ul>
            </div>
        </>
    );
}