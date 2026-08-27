/**
 * Custom Vector SVG Asset Library (Zero external emoji / character font dependencies)
 */
export class Icons {
  public static getIconSVG(iconId: string): string {
    switch (iconId) {
      case 'lightning':
      case 'speed':
        return `
          <svg viewBox="0 0 32 32" class="custom-icon-svg" fill="none" stroke="#000" stroke-width="2">
            <polygon points="18,2 6,18 16,18 14,30 26,14 16,14" fill="#FFE600" />
            <polygon points="17,5 9,17 15,17 14,26 23,15 16,15" fill="#FFF8B3" opacity="0.8" />
          </svg>
        `;
      case 'hazard':
      case 'gauntlet':
        return `
          <svg viewBox="0 0 32 32" class="custom-icon-svg" fill="none" stroke="#000" stroke-width="2">
            <polygon points="16,3 2,28 30,28" fill="#FF2A85" />
            <polygon points="16,7 5,26 27,26" fill="#FFE600" />
            <rect x="14.5" y="12" width="3" height="7" rx="1.5" fill="#050314" />
            <circle cx="16" cy="22.5" r="1.8" fill="#050314" />
          </svg>
        `;
      case 'rocket':
      case 'spring':
      case 'airtime':
        return `
          <svg viewBox="0 0 32 32" class="custom-icon-svg" fill="none" stroke="#000" stroke-width="2">
            <path d="M16 3 C22 8 25 16 23 23 L16 20 L9 23 C7 16 10 8 16 3 Z" fill="#00F0FF" />
            <path d="M16 7 C19 11 20 16 19 20 L16 18.5 L13 20 C12 16 13 11 16 7 Z" fill="#FFFFFF" />
            <circle cx="16" cy="13" r="2.5" fill="#FF2A85" />
            <polygon points="9,23 5,28 10,26" fill="#FFE600" />
            <polygon points="23,23 27,28 22,26" fill="#FFE600" />
            <polygon points="14,20 16,29 18,20" fill="#FF2A85" />
          </svg>
        `;
      case 'target':
      case 'pinball':
        return `
          <svg viewBox="0 0 32 32" class="custom-icon-svg" fill="none" stroke="#000" stroke-width="2">
            <circle cx="16" cy="16" r="13" fill="#FFE600" />
            <circle cx="16" cy="16" r="9.5" fill="#FF2A85" />
            <circle cx="16" cy="16" r="6" fill="#00F0FF" />
            <circle cx="16" cy="16" r="2.5" fill="#050314" />
          </svg>
        `;
      case 'gear':
      case 'machine':
        return `
          <svg viewBox="0 0 32 32" class="custom-icon-svg" fill="none" stroke="#000" stroke-width="2">
            <path d="M13,3 L19,3 L20,7 L24,9 L27,6 L31,10 L28,14 L30,18 L34,19 L34,25 L30,26 L28,30 L31,34 L27,38 L24,35 L20,37 L19,41 L13,41 L12,37 L8,35 L5,38 L1,34 L4,30 L2,26 L-2,25 L-2,19 L2,18 L4,14 L1,10 L5,6 L8,9 L12,7 Z" transform="scale(0.7) translate(7,5)" fill="#FF2A85" />
            <circle cx="16" cy="16" r="4.5" fill="#080616" stroke="#00F0FF" stroke-width="2" />
          </svg>
        `;
      case 'fork':
      case 'precision':
        return `
          <svg viewBox="0 0 32 32" class="custom-icon-svg" fill="none" stroke="#000" stroke-width="2">
            <path d="M16 28 L16 16 M16 16 L8 7 M16 16 L24 7" stroke="#00F0FF" stroke-width="4" stroke-linecap="round" />
            <polygon points="8,4 4,11 12,11" fill="#FFE600" />
            <polygon points="24,4 20,11 28,11" fill="#FF2A85" />
          </svg>
        `;
      case 'star':
        return `
          <svg viewBox="0 0 24 24" class="custom-icon-svg star-icon" fill="#000">
            <polygon points="12,2 15,9 22,9 17,14 19,21 12,17 5,21 7,14 2,9 9,9" fill="#000000" />
            <polygon points="12,4 14.5,9.5 20,9.5 16,13.5 17.5,19 12,15.5 6.5,19 8,13.5 4,9.5 9.5,9.5" fill="#FFE600" />
          </svg>
        `;
      default:
        return `
          <svg viewBox="0 0 32 32" class="custom-icon-svg" fill="none" stroke="#000" stroke-width="2">
            <circle cx="16" cy="16" r="12" fill="#00F0FF" />
            <polygon points="16,6 20,14 16,26 12,14" fill="#FFFFFF" />
          </svg>
        `;
    }
  }
}
