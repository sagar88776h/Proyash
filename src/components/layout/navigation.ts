export const PRIMARY_NAV = [
  { to: '/about', label: 'About' },
  { to: '/our-work', label: 'Our Work' },
  { to: '/villages', label: 'Villages' },
  { to: '/volunteer', label: 'Volunteer' },
  { to: '/transparency', label: 'Transparency' },
  { to: '/contact', label: 'Contact' },
] as const;

export const FOOTER_NAV = [
  {
    title: 'Get involved',
    links: [
      { to: '/request-help', label: 'Request help' },
      { to: '/request-help/status', label: 'Check a request' },
      { to: '/support-us', label: 'Support us' },
      { to: '/volunteer', label: 'Become a volunteer' },
    ],
  },
  {
    title: 'Organisation',
    links: [
      { to: '/about', label: 'About PRAYASH' },
      { to: '/our-work', label: 'Our work' },
      { to: '/villages', label: 'Villages we serve' },
      { to: '/transparency', label: 'Financial reports' },
    ],
  },
  {
    title: 'Information',
    links: [
      { to: '/contact', label: 'Contact us' },
      { to: '/privacy', label: 'Privacy policy' },
      { to: '/terms', label: 'Terms of use' },
    ],
  },
] as const;
