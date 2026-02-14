interface FooterProps {
  lastUpdate: Date | null;
}

export default function Footer({ lastUpdate }: FooterProps) {
  return (
    <footer>
      <span>
        Last update: {lastUpdate ? lastUpdate.toLocaleTimeString() : 'Never'}
      </span>
      <span className="refresh-indicator" />
    </footer>
  );
}
