import { promisify } from "util"
import { access, readdir } from "node:fs/promises"
import { constants as fsConstants } from "node:fs"
import { exec as execNoPromise } from "node:child_process"
import { delimiter, join } from "node:path"
import url from "node:url"
import * as chromeLauncherModule from "chrome-launcher"
import { Arkalis, ArkalisCore } from "./arkalis.js"
import CDP from "chrome-remote-interface"

const exec = promisify(execNoPromise)

type ChromeLauncherApi = {
  launch?: typeof import("chrome-launcher")["launch"]
  default?: {
    launch?: typeof import("chrome-launcher")["launch"]
  }
}

export const resolveChromeLaunch = (chromeLauncher: ChromeLauncherApi) => {
  const launch = chromeLauncher.launch ?? chromeLauncher.default?.launch
  if (!launch)
    throw new Error("chrome-launcher module does not expose launch()")
  return launch
}

const chromeExecutableNames = [
  "google-chrome",
  "google-chrome-stable",
  "chromium",
  "chromium-browser",
] as const

type AccessFn = (path: string, mode?: number) => Promise<void>
type ChromePathDirent = {
  name: string
  isDirectory: () => boolean
  isFile: () => boolean
}
type ReaddirFn = (path: string, options: { withFileTypes: true }) => Promise<ChromePathDirent[]>

type ChromePathResolverDeps = {
  env?: NodeJS.ProcessEnv
  access?: AccessFn
  readdir?: ReaddirFn
}

const canAccess = async (targetPath: string, accessFn: AccessFn) => {
  try {
    await accessFn(targetPath, fsConstants.X_OK)
    return true
  } catch {
    return false
  }
}

export const findChromePathInPlaywrightCache = async (
  rootDirectory = "/ms-playwright",
  { readdir: readdirFn = readdir }: Pick<ChromePathResolverDeps, "readdir"> = {},
): Promise<string | undefined> => {
  const pendingDirectories = [rootDirectory]

  while (pendingDirectories.length > 0) {
    const directory = pendingDirectories.shift()
    if (!directory)
      continue

    let entries: Awaited<ReturnType<ReaddirFn>>
    try {
      entries = await readdirFn(directory, { withFileTypes: true })
    } catch {
      continue
    }

    for (const entry of entries) {
      const entryPath = join(directory, entry.name)

      if (entry.isDirectory()) {
        pendingDirectories.push(entryPath)
        continue
      }

      if (entry.isFile() && entry.name === "chrome")
        return entryPath
    }
  }

  return undefined
}

export const resolveChromePath = async ({
  env = process.env,
  access: accessFn = access,
  readdir: readdirFn = readdir,
}: ChromePathResolverDeps = {}): Promise<string | undefined> => {
  const configuredChromePath = env["CHROME_PATH"]?.trim()
  if (configuredChromePath)
    return configuredChromePath

  const pathEntries = (env["PATH"] ?? "")
    .split(delimiter)
    .map(entry => entry.trim())
    .filter(entry => entry.length > 0)

  for (const directory of pathEntries) {
    for (const executableName of chromeExecutableNames) {
      const candidate = join(directory, executableName)
      if (await canAccess(candidate, accessFn))
        return candidate
    }
  }

  if (await canAccess("/ms-playwright", accessFn))
    return findChromePathInPlaywrightCache("/ms-playwright", { readdir: readdirFn })

  return undefined
}

export const ensureChromePath = async (deps: ChromePathResolverDeps = {}) => {
  const env = deps.env ?? process.env
  const resolvedChromePath = await resolveChromePath({ ...deps, env })
  if (resolvedChromePath && !env["CHROME_PATH"])
    env["CHROME_PATH"] = resolvedChromePath
  return resolvedChromePath
}

export const arkalisBrowser = async (arkalis: ArkalisCore) => {
  async function genWindowCoords() {
    let res: [number, number]
    try {
      const screenResolution = await exec("xdpyinfo | grep dimensions")
      const rawRes = / (?<res>\d+x\d+) /u.exec(screenResolution.stdout)?.groups?.["res"]?.trim().split("x")
      if (!rawRes || rawRes.length !== 2)
        throw new Error("Unable to get screen resolution")
      res = (rawRes as [string, string]).map(num => parseInt(num)) as [number, number]
    } catch (e) {
      arkalis.log("Failed to get screen resolution, falling back to 1920x1080:", e)
      res = [1920, 1080]
    }

    const size = [Math.ceil(res[0] * (Math.random() * 0.2 + 0.8)), Math.ceil(res[1] * (Math.random() * 0.2 + 0.8))] as const
    return {
      size,
      pos: [Math.ceil((res[0] - size[0]) * Math.random()), Math.ceil((res[1] - size[1]) * Math.random())] as const
    }
  }

  // generate a random window size
  const window = await genWindowCoords()

  // these domains are used by the browser when creating a new profile
  const blockDomains = [
    "accounts.google.com", "clients2.google.com", "optimizationguide-pa.googleapis.com",
    "content-autofill.googleapis.com"
  ]

  const switches = [
    // these should all be undetectable, but speed things up
    "disable-sync", "disable-backgrounding-occluded-windows", "disable-breakpad",
    "disable-domain-reliability", "disable-background-networking", "disable-features=AutofillServerCommunication",
    "disable-features=CertificateTransparencyComponentUpdater", "enable-crash-reporter-for-testing", "no-service-autorun",
    "no-first-run", "no-default-browser-check", "disable-prompt-on-repost", "disable-client-side-phishing-detection",
    "disable-features=InterestFeedContentSuggestions", "disable-features=Translate", "disable-hang-monitor",
    "autoplay-policy=no-user-gesture-required", "use-mock-keychain", "disable-omnibox-autocomplete-off-method",
    "disable-gaia-services", "disable-crash-reporter", "noerrdialogs", "disable-component-update",
    "disable-features=MediaRouter", "metrics-recording-only", "disable-features=OptimizationHints",
    "disable-component-update", "disable-features=CalculateNativeWinOcclusion", "enable-precise-memory-info",

    "no-sandbox", "disable-dev-shm-usage",  // for linux docker

    // "disable-blink-features=AutomationControlled", // not working
    // "auto-open-devtools-for-tabs",
    // "log-net-log=tmp/out.json", "net-log-capture-mode=Everything",     // note, does not log requests
    // TODO: pass this in dyanmically from a hook in the har scraper
    "log-net-log=./tmp/netlog.json", "net-log-capture-mode=Everything",

    arkalis.debugOptions.browserDebug === "verbose" ? "enable-logging=stderr": "",
    arkalis.debugOptions.browserDebug === "verbose" ? "v=2" : "",
    arkalis.scraperMeta.useGlobalBrowserCache ? `disk-cache-dir=${arkalis.debugOptions.globalBrowserCacheDir}` : "",
    `window-position=${window.pos[0]},${window.pos[1]}`,
    `window-size=${window.size[0]},${window.size[1]}`,
    `host-rules=${blockDomains.map(blockDomain => `MAP ${blockDomain} 0.0.0.0`).join(", ")}`,   // NOTE: detectable!
  ]

  // apply proxy
  const proxy = (arkalis as Arkalis).proxy
  if (proxy) {
    const parsedProxy = url.parse(proxy)
    if (!parsedProxy.hostname || !parsedProxy.protocol || !parsedProxy.host)
      throw new Error(`Invalid proxy: ${proxy}`)
    switches.push(`proxy-server=${parsedProxy.protocol}//${parsedProxy.host}`)
    switches.push(`host-resolver-rules=MAP * ~NOTFOUND , EXCLUDE ${parsedProxy.hostname}`)
  }

  // launch chrome
  await ensureChromePath()
  const launchChrome = resolveChromeLaunch(chromeLauncherModule)
  const instance = await launchChrome({
    chromeFlags: switches.map(s => s.length > 0 ? `--${s}` : ""),
    ignoreDefaultFlags: true,
    logLevel: arkalis.debugOptions.browserDebug ? "verbose" : "silent",
  })

  // connect to cdp client
  arkalis.debugOptions.browserDebug && arkalis.log("connecting to cdp client")
  arkalis.client = await CDP({ port: instance.port })
  await arkalis.client.Network.enable()
  await arkalis.client.Page.enable()
  await arkalis.client.Runtime.enable()
  await arkalis.client.DOM.enable()

  // timezone (set either by the caller or the proxy)
  if (arkalis.debugOptions.timezone)
    await arkalis.client.Emulation.setTimezoneOverride({ timezoneId: arkalis.debugOptions.timezone })

  // block requested URLs
  if (arkalis.scraperMeta.blockUrls.length > 0)
    await arkalis.client.Network.setBlockedURLs({ urls: arkalis.scraperMeta.blockUrls })

  return {
    close: async () => {
      arkalis.debugOptions.browserDebug && arkalis.log("closing cdp client and browser")

      await arkalis.client.Network.disable().catch(() => {})
      await arkalis.client.Page.disable().catch(() => {})
      await arkalis.client.Runtime.disable().catch(() => {})
      await arkalis.client.DOM.disable().catch(() => {})

      await arkalis.client.Browser.close().catch(() => {})
      await arkalis.client.close().catch(() => {})

      instance.kill()
    }
  }
}
