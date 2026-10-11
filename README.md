# ahcalc

ahcalc (Astrohacker Calculator) is a scientific calculator for Astrohacker
TermSurf. It opens in the current TermSurf pane.

ahcalc is installed separately. The calculator requires Astrohacker TermSurf.
Support for other terminals is not implemented here.

## Installation

Install from the shared Astrohacker Homebrew tap on an Apple-silicon Mac
running macOS 26 or newer:

```nu
brew trust astrohackerlabs/astrohacker
brew tap astrohackerlabs/astrohacker
brew install ahcalc
ahcalc --version
ahcalc --help
```

Install Astrohacker TermSurf separately. The formula does not install or own
TermSurf. Running this prebuilt package does not require Bun or Node.

Inside an Astrohacker TermSurf pane:

```nu
ahcalc
```

Identity and help work outside TermSurf; the calculator does not.

## Build from source

See AGENTS.md in this repository.
