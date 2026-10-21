import {
	AtomIcon,
	BracesIcon,
	CodeXmlIcon,
	CoffeeIcon,
	ContainerIcon,
	DatabaseIcon,
	FileIcon,
	FileTextIcon,
	ImageIcon,
	LockIcon,
	type LucideIcon,
	SettingsIcon,
	TerminalIcon,
} from "lucide-react"

type FileType =
	| { kind: "badge"; text: string; background: string; foreground: string }
	| { kind: "icon"; Icon: LucideIcon; color?: string }

const badge = (text: string, background: string, foreground = "#ffffff"): FileType => ({
	kind: "badge",
	text,
	background,
	foreground,
})
const icon = (Icon: LucideIcon, color?: string): FileType => ({ kind: "icon", Icon, color })

const IMAGE = icon(ImageIcon, "#a074c4")
const CONFIG = icon(SettingsIcon, "#8c8c8c")
const SHELL = icon(TerminalIcon, "#4eaa25")
const REACT = icon(AtomIcon, "#61dafb")
const JS = badge("JS", "#f7df1e", "#1e1e1e")

const BY_NAME: Record<string, FileType> = {
	dockerfile: icon(ContainerIcon, "#2496ed"),
	"docker-compose.yml": icon(ContainerIcon, "#2496ed"),
	"docker-compose.yaml": icon(ContainerIcon, "#2496ed"),
	"package-lock.json": icon(LockIcon, "#8c8c8c"),
	"bun.lock": icon(LockIcon, "#8c8c8c"),
	"yarn.lock": icon(LockIcon, "#8c8c8c"),
	"pnpm-lock.yaml": icon(LockIcon, "#8c8c8c"),
	".gitignore": icon(SettingsIcon, "#f05033"),
	".gitattributes": icon(SettingsIcon, "#f05033"),
	makefile: icon(SettingsIcon, "#6d8086"),
}

const BY_EXTENSION: Record<string, FileType> = {
	ts: badge("TS", "#3178c6"),
	mts: badge("TS", "#3178c6"),
	cts: badge("TS", "#3178c6"),
	tsx: REACT,
	jsx: REACT,
	js: JS,
	mjs: JS,
	cjs: JS,
	json: icon(BracesIcon, "#cbcb41"),
	jsonc: icon(BracesIcon, "#cbcb41"),
	md: icon(FileTextIcon, "#519aba"),
	mdx: icon(FileTextIcon, "#519aba"),
	py: badge("PY", "#3776ab"),
	java: icon(CoffeeIcon, "#e76f00"),
	kt: badge("KT", "#7f52ff"),
	go: badge("GO", "#00add8"),
	rs: badge("RS", "#dea584", "#1e1e1e"),
	c: badge("C", "#5c6bc0"),
	h: badge("H", "#5c6bc0"),
	cpp: badge("C++", "#00599c"),
	cc: badge("C++", "#00599c"),
	hpp: badge("H++", "#00599c"),
	cs: badge("C#", "#239120"),
	php: badge("PHP", "#777bb4"),
	rb: badge("RB", "#cc342d"),
	swift: badge("SW", "#f05138"),
	dart: badge("DT", "#0175c2"),
	lua: badge("LUA", "#2c2d72"),
	r: badge("R", "#276dc3"),
	html: icon(CodeXmlIcon, "#e34c26"),
	htm: icon(CodeXmlIcon, "#e34c26"),
	xml: icon(CodeXmlIcon, "#e37933"),
	css: badge("#", "#1572b6"),
	scss: badge("S", "#cd6799"),
	sass: badge("S", "#cd6799"),
	less: badge("L", "#1d365d"),
	vue: badge("V", "#41b883"),
	svelte: badge("S", "#ff3e00"),
	yml: badge("YML", "#cb171e"),
	yaml: badge("YML", "#cb171e"),
	toml: CONFIG,
	ini: CONFIG,
	cfg: CONFIG,
	conf: CONFIG,
	sh: SHELL,
	bash: SHELL,
	zsh: SHELL,
	ps1: icon(TerminalIcon, "#5391fe"),
	bat: icon(TerminalIcon, "#c1f12e"),
	sql: icon(DatabaseIcon, "#e38c00"),
	prisma: icon(DatabaseIcon, "#5a67d8"),
	proto: badge("PB", "#4285f4"),
	graphql: badge("GQL", "#e10098"),
	lock: icon(LockIcon, "#8c8c8c"),
	txt: icon(FileTextIcon),
	png: IMAGE,
	jpg: IMAGE,
	jpeg: IMAGE,
	gif: IMAGE,
	webp: IMAGE,
	ico: IMAGE,
	svg: icon(ImageIcon, "#ffb13b"),
}

export function getFileType(fileName: string): FileType {
	const name = fileName.toLowerCase()
	const dot = name.lastIndexOf(".")
	return BY_NAME[name] ?? (dot >= 0 ? BY_EXTENSION[name.slice(dot + 1)] : undefined) ?? icon(FileIcon)
}

export function FileTypeIcon({ fileName, size = 14 }: { fileName: string; size?: number }) {
	const type = getFileType(fileName)
	if (type.kind === "icon") {
		return (
			<type.Icon
				aria-hidden="true"
				className="shrink-0"
				data-testid="file-type-icon"
				size={size}
				style={type.color ? { color: type.color } : undefined}
			/>
		)
	}
	return (
		<span
			aria-hidden="true"
			className="inline-flex shrink-0 items-center justify-center rounded-[3px] font-bold leading-none"
			data-testid="file-type-icon"
			style={{
				width: size,
				height: size,
				fontSize: type.text.length > 2 ? size * 0.4 : size * 0.5,
				background: type.background,
				color: type.foreground,
				letterSpacing: "-0.02em",
			}}>
			{type.text}
		</span>
	)
}
