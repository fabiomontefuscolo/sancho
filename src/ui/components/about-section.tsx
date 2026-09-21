const REPO_URL = "https://github.com/fabiomontefuscolo/sancho";
const LICENSE_URL = `${REPO_URL}/blob/main/LICENSE`;

export function AboutSection() {
  const version = globalThis.chrome?.runtime?.getManifest?.()?.version ?? "dev";
  return (
    <section aria-label="About" className="options-section">
      <h2>About</h2>
      <dl className="about-grid">
        <dt>Version</dt>
        <dd>{version}</dd>
        <dt>License</dt>
        <dd>
          <a href={LICENSE_URL} target="_blank" rel="noreferrer">
            GNU GPL v3 or later
          </a>
        </dd>
        <dt>Source code</dt>
        <dd>
          <a href={REPO_URL} target="_blank" rel="noreferrer">
            {REPO_URL.replace("https://", "")}
          </a>
        </dd>
      </dl>
      <p className="about-note">
        Sancho is free software: you can redistribute it and/or modify it under the terms of the GNU
        General Public License. It comes with ABSOLUTELY NO WARRANTY. Copyright (C) 2026 Sancho
        contributors.
      </p>
    </section>
  );
}
