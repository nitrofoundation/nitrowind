import { ArrowUpRight, HeartHandshake } from 'lucide-react';

export default function CoffeeSupportCard() {
  return (
    <a
      className="coffee-support-card"
      href="https://buymeacoffee.com/joylan"
      rel="noreferrer"
      target="_blank"
    >
      <span className="coffee-support-label">
        <HeartHandshake aria-hidden="true" /> OPEN SOURCE
      </span>
      <strong>Invest in native-first styling.</strong>
      <small>
        Your support funds runtime engineering, platform compatibility, and documentation for the
        React Native community.
      </small>
      <em>
        Support the project <ArrowUpRight aria-hidden="true" />
      </em>
    </a>
  );
}
