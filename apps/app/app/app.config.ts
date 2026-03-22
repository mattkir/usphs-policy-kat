export default defineAppConfig({
  app: {
    name: 'USPHS Policy',
    description: 'Policy knowledge agent with file-system search over your sources.',
    icon: 'i-simple-icons-vercel',
    repoUrl: 'https://github.com/mattkir/usphs-policy-kat',
    deployUrl:
      'https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fmattkir%2Fusphs-policy-kat&env=BETTER_AUTH_SECRET,GITHUB_CLIENT_ID,GITHUB_CLIENT_SECRET&envDescription=BETTER_AUTH_SECRET%3A%20run%20openssl%20rand%20-hex%2032%20%7C%20GITHUB_CLIENT_ID%20%2B%20SECRET%3A%20create%20a%20GitHub%20App%20at%20github.com%2Fsettings%2Fapps%2Fnew&envLink=https%3A%2F%2Fgithub.com%2Fmattkir%2Fusphs-policy-kat%2Fblob%2Fmain%2Fdocs%2FENVIRONMENT.md&project-name=usphs-policy&repository-name=usphs-policy-kat',
  },
  ui: {
    colors: {
      primary: 'neutral',
      neutral: 'neutral'
    },
    dashboardPanel: {
      slots: {
        root: 'min-h-[calc(100svh-1rem)]',
        body: 'sm:p-4 sm:gap-4'
      }
    },
    dashboardSidebar: {
      slots: {
        header: 'h-auto flex-col items-stretch gap-1.5 p-2',
        body: 'p-2 gap-1 overflow-hidden',
        footer: 'p-0',
        toggle: '-ms-1.5'
      }
    },
    dashboardNavbar: {
      slots: {
        root: 'sm:px-4 h-12',
        toggle: '-ms-1.5'
      }
    }
  }
})
