import HubHome from './pages/HubHome.jsx';
import WordlePage from './games/wordle/WordlePage.jsx';

export default function App() {
  const path = window.location.pathname.replace(/\/+$/, '') || '/';
  if (path === '/play/wordle') return <WordlePage />;
  return <HubHome />;
}
