interface FooterProps {
  lastUpdate: Date | null;
}

export default function Footer({ lastUpdate }: FooterProps) {
  return (
    <footer>
      <span>
        Last update: {lastUpdate ? lastUpdate.toLocaleTimeString() : 'Never'}
      </span>
      <span className="footer-copyright">
        {'\u00A9'} {new Date().getFullYear()} Postal Systems O{'\u00DC'} &middot;{' '}
        <a href="https://github.com/postalsys/Muti-Metroo-Manager" target="_blank" rel="noopener noreferrer">
          GitHub
        </a>{' '}
        &middot; MIT License
      </span>
      <span className="refresh-indicator" />
    </footer>
  );
}
