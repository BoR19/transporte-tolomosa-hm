import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  collection,
  deleteDoc,
  doc,
  limit,
  onSnapshot,
  query,
  setDoc,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './firebase.js';

/*
 * Tokens extraídos de la imagen
 * azul app      #0b4bbf   (cabecera, botones primarios, iconos)
 * azul claro    #e9f1fd   (fondos de tarjeta / info)   borde #d3e0f4
 * violeta admin #5b3db0
 * verde         #16a34a   (Comenzar, Disponible)   chip claro #c9f2d3 / texto #1a7a3a
 * tinta         #11203f   (títulos)   gris #5f6f8a   gris inactivo #e3e7ee
 * Tipografía: Nunito Sans 400/600/700/800. Radios: 12 campos · 16 botones · 24 hojas · 46 teléfono
 * Espaciado: rejilla de 4px, margen lateral de pantalla 16px
 */

type RoleView = 'pas' | 'chof' | 'adm';
type Direction = 'campesino' | 'ramales';

interface Driver {
  id: number;
  name: string;
  phone: string;
  pin: string;
  micro: number | null;
  ramal: number;
  on: boolean;
  cap: string;
}

interface Vehiculo {
  id: number;
  numero: number;
  ramal: number;
  activo: boolean;
}

interface ActiveTrip {
  driverId: number;
  name: string;
  micro: number;
  ramal: number;
  dir: Direction;
  start: number;
}

interface Jornada {
  k: number;
  name: string;
  micro: number;
  ramal: number;
  dir: Direction;
  start: number;
  end: number;
}

interface AppConfig {
  coop: string;
  notif: boolean;
}

interface AuthState {
  chof?: boolean;
  adm?: boolean;
  driverId?: number;
}

interface LiveLocation {
  lat: number;
  lng: number;
  enServicio: boolean;
  ramal: number;
  direccion: Direction;
  actualizadoEn: number;
}

interface QueuedGpsPoint extends LiveLocation {
  driverId: number;
}

interface ToastState {
  phone: RoleView;
  msg: string;
  tone: 'ok' | 'err';
  k: number;
}

const Svg = ({
  children,
  className = 'w-6 h-6',
  sw = 2.2,
}: {
  children: React.ReactNode;
  className?: string;
  sw?: number;
}) => (
  <svg
    viewBox="0 0 24 24"
    className={className}
    fill="none"
    stroke="currentColor"
    strokeWidth={sw}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {children}
  </svg>
);

const F = { fill: 'currentColor', stroke: 'none' } as const;

const Ic = {
  pin: (c: string) => (
    <Svg className={c}>
      <path {...F} d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0z" />
      <circle cx="12" cy="10" r="3" fill="#fff" stroke="none" />
    </Svg>
  ),
  bus: (c: string) => (
    <Svg className={c}>
      <rect {...F} x="4" y="3" width="16" height="15" rx="3.5" />
      <rect
        x="6.5"
        y="5.5"
        width="11"
        height="6"
        rx="1.3"
        style={{ fill: 'var(--win,#fff)' }}
        stroke="none"
      />
      <circle {...F} cx="8" cy="20" r="1.7" />
      <circle {...F} cx="16" cy="20" r="1.7" />
      <circle
        cx="8"
        cy="14.5"
        r="1"
        style={{ fill: 'var(--win,#fff)' }}
        stroke="none"
      />
      <circle
        cx="16"
        cy="14.5"
        r="1"
        style={{ fill: 'var(--win,#fff)' }}
        stroke="none"
      />
    </Svg>
  ),
  wheel: (c: string) => (
    <Svg className={c} sw={2.4}>
      <circle cx="12" cy="12" r="9.5" />
      <circle cx="12" cy="12" r="2.4" {...F} />
      <path d="M3 10.5h6.5M14.5 10.5H21M12 14.5V21" />
    </Svg>
  ),
  user: (c: string) => (
    <Svg className={c}>
      <circle {...F} cx="12" cy="8" r="4.2" />
      <path {...F} d="M3.5 21c0-4.6 3.8-7 8.5-7s8.5 2.4 8.5 7z" />
    </Svg>
  ),
  target: (c: string) => (
    <Svg className={c} sw={2}>
      <circle cx="12" cy="12" r="6.5" />
      <circle cx="12" cy="12" r="2.2" {...F} />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
    </Svg>
  ),
  search: (c: string) => (
    <Svg className={c} sw={2.6}>
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.8-4.8" />
    </Svg>
  ),
  chevron: (c: string) => (
    <Svg className={c} sw={2.6}>
      <path d="m6 9 6 6 6-6" />
    </Svg>
  ),
  check: (c: string) => (
    <Svg className={c}>
      <circle {...F} cx="12" cy="12" r="11" />
      <path d="m7 12.5 3.3 3.3L17 9" stroke="#fff" strokeWidth="2.8" />
    </Svg>
  ),
  info: (c: string) => (
    <Svg className={c}>
      <circle {...F} cx="12" cy="12" r="11" />
      <path d="M12 11v6" stroke="#fff" strokeWidth="2.8" />
      <circle cx="12" cy="7.3" r="1.5" fill="#fff" stroke="none" />
    </Svg>
  ),
  play: (c: string) => (
    <Svg className={c}>
      <path {...F} d="M7 4.5v15l13-7.5z" />
    </Svg>
  ),
  up: (c: string) => (
    <Svg className={c} sw={2.8}>
      <path d="M12 20V5M5 12l7-7 7 7" />
    </Svg>
  ),
  down: (c: string) => (
    <Svg className={c} sw={2.8}>
      <path d="M12 4v15M5 12l7 7 7-7" />
    </Svg>
  ),
  people: (c: string) => (
    <Svg className={c}>
      <circle {...F} cx="12" cy="7" r="3.4" />
      <circle {...F} cx="4.8" cy="9.5" r="2.4" />
      <circle {...F} cx="19.2" cy="9.5" r="2.4" />
      <path {...F} d="M5.5 20c0-3.8 2.6-5.8 6.5-5.8s6.5 2 6.5 5.8z" />
      <path
        {...F}
        d="M0.8 19c0-2.6 1.4-4.2 3.6-4.5-1 1-1.5 2.6-1.4 4.5zM23.2 19c0-2.6-1.4-4.2-3.6-4.5 1 1 1.5 2.6 1.4 4.5z"
      />
    </Svg>
  ),
  gear: (c: string) => (
    <Svg className={c}>
      <circle cx="12" cy="12" r="7.6" strokeWidth="4" strokeDasharray="2.9 2.95" />
      <circle cx="12" cy="12" r="6.2" strokeWidth="3.2" />
    </Svg>
  ),
  bars: (c: string) => (
    <Svg className={c}>
      <rect {...F} x="3.5" y="13" width="4.6" height="8" rx="1" />
      <rect {...F} x="9.7" y="8" width="4.6" height="13" rx="1" />
      <rect {...F} x="15.9" y="3" width="4.6" height="18" rx="1" />
    </Svg>
  ),
  cal: (c: string) => (
    <Svg className={c}>
      <rect {...F} x="3" y="4.5" width="18" height="17" rx="3.5" />
      <path d="M8 2.5v4M16 2.5v4" strokeWidth="2.4" />
      <path d="M3 9.5h18" stroke="#fff" strokeWidth="1.6" />
      <g fill="#fff" stroke="none">
        {[0, 1, 2].map((r) =>
          [0, 1, 2, 3].map((k) => (
            <rect
              key={`${r}-${k}`}
              x={5.6 + k * 3.6}
              y={11.6 + r * 3.1}
              width="2"
              height="2"
              rx=".4"
            />
          ))
        )}
      </g>
    </Svg>
  ),
  home: (c: string) => (
    <Svg className={c}>
      <path {...F} d="M3 11.5 12 3l9 8.5V21h-6v-6H9v6H3z" />
    </Svg>
  ),
  logout: (c: string) => (
    <Svg className={c} sw={2.4}>
      <path d="M9 21H5V3h4M16 17l5-5-5-5M21 12H9" />
    </Svg>
  ),
  plus: (c: string) => (
    <Svg className={c} sw={2.8}>
      <path d="M12 5v14M5 12h14" />
    </Svg>
  ),
  road: (c: string) => (
    <Svg className={c}>
      <path {...F} d="M10 3h4l7.5 18h-19z" />
      <path d="M12 6.5v3M12 12v3M12 17.5v2" stroke="#fff" strokeWidth="1.8" />
    </Svg>
  ),
  arrow: (c: string) => (
    <Svg className={c}>
      <path {...F} d="M3 11 22 2l-9 19-2-8z" />
    </Svg>
  ),
  bell: (c: string) => (
    <Svg className={c}>
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </Svg>
  ),
  close: (c: string) => (
    <Svg className={c} sw={2.6}>
      <path d="M18 6 6 18M6 6l12 12" />
    </Svg>
  ),
  eye: (c: string) => (
    <Svg className={c} sw={2.2}>
      <path d="M2 12s3.8-6.5 10-6.5S22 12 22 12s-3.8 6.5-10 6.5S2 12 2 12Z" />
      <circle cx="12" cy="12" r="2.7" />
    </Svg>
  ),
  eyeOff: (c: string) => (
    <Svg className={c} sw={2.2}>
      <path d="M3 3l18 18M10.6 10.6a2.5 2.5 0 0 0 3.4 3.4M9.9 5.2A10.7 10.7 0 0 1 12 5c6.2 0 10 7 10 7a17.5 17.5 0 0 1-3.2 4.3M6.6 6.6A17.2 17.2 0 0 0 2 12s3.8 7 10 7a9.9 9.9 0 0 0 4.3-.9" />
    </Svg>
  ),
  phone: (c: string) => (
    <Svg className={c} sw={2.2}>
      <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.4 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7A2 2 0 0 1 22 16.9Z" />
    </Svg>
  ),
  edit: (c: string) => (
    <Svg className={c} sw={2.2}>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </Svg>
  ),
};

const Ridge = ({ className = '' }: { className?: string }) => (
  <svg
    viewBox="0 0 160 40"
    className={className}
    fill="none"
    stroke="#2f6fe0"
    strokeWidth="3"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M2 36 40 18 56 26 86 6 104 22 118 14 158 36" />
    <path d="M70 16 86 6 98 15" strokeWidth="2" />
  </svg>
);

/* ---------- piezas reutilizables ---------- */
const AppShell = ({
  children,
  overlay,
  toast,
  lift = 16,
  bg = 'bg-[#eaf1fd]',
}: {
  children: React.ReactNode;
  overlay?: React.ReactNode;
  toast?: ToastState | null;
  lift?: number;
  bg?: string;
}) => (
  <div className={`relative flex min-h-dvh w-full flex-col ${bg}`}>
    {children}
    {overlay}
    {toast && (
      <div
        role="status"
        style={{ bottom: `calc(${lift}px + env(safe-area-inset-bottom, 0px))` }}
        className={`fixed inset-x-4 z-50 mx-auto max-w-md rounded-[14px] px-4 py-3 text-[15px] font-bold leading-tight text-white shadow-lg md:left-auto md:right-6 md:mx-0 md:w-96 ${
          toast.tone === 'err' ? 'bg-[#c0332b]' : 'bg-[#16a34a]'
        }`}
      >
        {toast.msg}
      </div>
    )}
  </div>
);

const Header = ({
  icon,
  title,
  subtitle,
  action,
  tone = 'bg-[#0b4bbf]',
  big = false,
}: {
  icon: React.ReactNode;
  title: React.ReactNode;
  subtitle?: string;
  action?: React.ReactNode;
  tone?: string;
  big?: boolean;
}) => (
  <header className={`${tone} w-full text-white`}>
    <div className="mx-auto flex w-full max-w-6xl items-center gap-3 px-5 pb-4 pt-[max(1rem,env(safe-area-inset-top))] md:px-6">
      <span className="grid h-14 w-14 shrink-0 place-items-center">{icon}</span>
      <div className="min-w-0 flex-1">
        <h1 className={`font-extrabold leading-[1.02] ${big ? 'text-[30px]' : 'text-[27px]'}`}>
          {title}
        </h1>
        {subtitle && (
          <p className="mt-0.5 truncate text-[15px] font-semibold opacity-90">{subtitle}</p>
        )}
      </div>
      {action}
    </div>
  </header>
);

const Field = ({
  icon,
  tint,
  label,
  value,
  right,
  onRight,
  rightLabel,
  children,
}: {
  icon: React.ReactNode;
  tint: string;
  label?: string;
  value: string;
  right: React.ReactNode;
  onRight?: () => void;
  rightLabel?: string;
  children?: React.ReactNode;
}) => (
  <div className="relative flex items-center rounded-[14px] border border-[#d3e0f4] bg-white">
    <span className={`m-1 grid h-11 w-11 shrink-0 place-items-center rounded-[10px] ${tint}`}>{icon}</span>
    <div className="min-w-0 flex-1 pl-2 leading-tight">
      {label && <div className="text-[13px] font-semibold text-[#1a62d6]">{label}</div>}
      <div className="truncate text-[17px] font-bold text-[#11203f]">{value}</div>
    </div>
    <span className={`relative z-10 pr-3 text-[#0b4bbf] ${onRight ? '' : 'pointer-events-none'}`}>
      {onRight ? (
        <button type="button" onClick={onRight} aria-label={rightLabel}>
          {right}
        </button>
      ) : (
        right
      )}
    </span>
    {children}
  </div>
);

const Chip = ({ on, children }: { on: boolean; children: React.ReactNode }) => (
  <span
    className={`rounded-full px-3 py-[3px] text-[13px] font-bold ${
      on ? 'bg-[#c9f2d3] text-[#1a7a3a]' : 'bg-[#e3e7ee] text-[#7a8699]'
    }`}
  >
    {children}
  </span>
);

const Toggle = ({
  on,
  label,
  onClick,
}: {
  on: boolean;
  label: string;
  onClick: () => void;
}) => (
  <button
    type="button"
    role="switch"
    aria-checked={on}
    aria-label={label}
    onClick={onClick}
    className={`relative h-[30px] w-[52px] shrink-0 rounded-full ${
      on ? 'bg-[#0b5bdb]' : 'bg-[#e3e7ee]'
    }`}
  >
    <span
      className={`absolute top-[3px] h-6 w-6 rounded-full bg-white shadow ${
        on ? 'right-[3px]' : 'left-[3px] border border-[#c9cfdb]'
      }`}
    />
  </button>
);

const Avatar = ({ cap }: { cap: string }) => (
  <svg viewBox="0 0 40 40" className="h-10 w-10 shrink-0" aria-hidden="true">
    <circle cx="20" cy="20" r="20" fill="#cfe3ff" />
    <path d="M6 40c0-9 6-13 14-13s14 4 14 13z" fill="#1f5fd0" />
    <circle cx="20" cy="17" r="8" fill="#f1b27d" />
    <path d="M11.5 15.5c0-6 3.6-8.5 8.5-8.5s8.5 2.5 8.5 8.5z" fill={cap} />
    <rect x="9" y="14.5" width="22" height="2.6" rx="1.3" fill={cap} />
    <circle cx="16.8" cy="18.5" r="1" fill="#2a1a10" />
    <circle cx="23.2" cy="18.5" r="1" fill="#2a1a10" />
    <path
      d="M17 22.2q3 2 6 0"
      stroke="#7a3f1d"
      strokeWidth="1.2"
      fill="none"
      strokeLinecap="round"
    />
  </svg>
);

/* ---------- mapa interactivo con Leaflet.js ---------- */
const DEFAULT_POS: [number, number] = [-21.5236, -64.7393]; // Mercado Campesino, Tarija

const escHtml = (s: string) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

interface MapBusItem {
  id: number;
  micro: number;
  ramal: number;
  m: number;
  eta: number;
  lat: number;
  lng: number;
  t: ActiveTrip | null;
}

const createUserIcon = () =>
  L.divIcon({
    className: 'tolomosa-user-icon',
    iconSize: [150, 92],
    iconAnchor: [75, 74],
    html: `
      <div style="position:relative;width:150px;height:92px;pointer-events:auto;">
        <div style="position:absolute;top:0;left:50%;transform:translateX(-50%);white-space:nowrap;border-radius:12px;background:#1b4fd0;padding:5px 14px;font-size:14px;font-weight:800;color:#fff;box-shadow:0 4px 12px rgba(27,79,208,.35);">
          Usted está aquí
          <span style="position:absolute;bottom:-5px;left:50%;width:10px;height:10px;transform:translateX(-50%) rotate(45deg);background:#1b4fd0;"></span>
        </div>
        <span style="position:absolute;top:56px;left:50%;width:36px;height:36px;transform:translate(-50%,-50%);border-radius:9999px;background:rgba(58,107,255,.28);"></span>
        <span style="position:absolute;top:56px;left:50%;width:26px;height:26px;transform:translate(-50%,-50%);border-radius:9999px;border:3px solid #fff;background:#1b4fd0;box-shadow:0 2px 8px rgba(17,32,63,.35);"></span>
      </div>
    `,
  });

const createBusIcon = (micro: number, active: boolean, selected: boolean) => {
  const strokeColor = selected ? '#0b4bbf' : active ? '#16a34a' : '#1fa64f';
  const badgeBg = selected ? '#0b4bbf' : active ? '#16a34a' : '#11203f';
  const halo = selected
    ? '<span style="position:absolute;top:24px;left:50%;width:44px;height:44px;transform:translate(-50%,-50%);border-radius:9999px;background:rgba(11,75,191,.28);border:2px solid rgba(11,75,191,.55);"></span>'
    : active
      ? '<span style="position:absolute;top:24px;left:50%;width:34px;height:34px;transform:translate(-50%,-50%);border-radius:9999px;background:rgba(22,163,74,.24);"></span>'
      : '';

  return L.divIcon({
    className: 'tolomosa-bus-icon',
    iconSize: [48, 62],
    iconAnchor: [24, 48],
    popupAnchor: [0, -46],
    html: `
      <div style="position:relative;width:48px;height:62px;display:flex;flex-direction:column;align-items:center;transform:${selected ? 'scale(1.14)' : 'scale(1)'};transition:transform 0.2s ease;">
        ${halo}
        <svg viewBox="0 0 36 44" style="width:36px;height:44px;filter:drop-shadow(0 3px 6px rgba(17,32,63,.32));position:relative;" aria-hidden="true">
          <path d="M18 42C18 42 3 28 3 17a15 15 0 0 1 30 0c0 11-15 25-15 25z" fill="#fff" stroke="${strokeColor}" stroke-width="3" />
          <rect x="10.5" y="9" width="15" height="12.5" rx="3" fill="${strokeColor}" />
          <rect x="12.5" y="11" width="11" height="5" rx="1" fill="#fff" />
          <circle cx="13.5" cy="23" r="1.4" fill="${strokeColor}" />
          <circle cx="22.5" cy="23" r="1.4" fill="${strokeColor}" />
        </svg>
        <span style="margin-top:-4px;border-radius:9999px;background:${badgeBg};padding:1px 7px;font-size:10.5px;font-weight:800;line-height:1.25;color:#fff;white-space:nowrap;box-shadow:0 2px 5px rgba(0,0,0,.24);">
          N° ${micro}
        </span>
      </div>
    `,
  });
};

const buildBusPopupHtml = (b: MapBusItem) => {
  const ramalName = escHtml(RAMALES[b.ramal] ?? 'Tolomosa');
  const dirLabel = b.t ? ` · ${escHtml(dirTxt(b.t.dir))}` : '';
  const statusBg = b.t ? '#c9f2d3' : '#e3e7ee';
  const statusFg = b.t ? '#1a7a3a' : '#5f6f8a';
  const statusTxt = b.t ? 'En servicio' : 'Disponible';
  return `
    <div style="min-width:160px;color:#11203f;">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:3px;">
        <strong style="font-size:15px;font-weight:800;">Micro N° ${b.micro}</strong>
        <span style="border-radius:9999px;background:${statusBg};color:${statusFg};padding:1px 8px;font-size:11px;font-weight:800;">${statusTxt}</span>
      </div>
      <div style="font-size:12.5px;color:#5f6f8a;font-weight:600;">Ramal ${ramalName}${dirLabel}</div>
      <div style="margin-top:3px;font-size:13px;color:#0b4bbf;font-weight:800;">A ${escHtml(formatDist(b.m))} · ~${b.eta} min</div>
    </div>
  `;
};

const TolomosaMap = ({
  userPos,
  accuracy,
  buses,
  selectedBusId,
  focusBusNonce,
  onSelectBus,
  centerNonce,
  visible,
}: {
  userPos: [number, number];
  accuracy: number | null;
  buses: MapBusItem[];
  selectedBusId: number | null;
  focusBusNonce: number;
  onSelectBus: (id: number) => void;
  centerNonce: number;
  visible: boolean;
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const userMarkerRef = useRef<L.Marker | null>(null);
  const accuracyCircleRef = useRef<L.Circle | null>(null);
  const busMarkersRef = useRef<
    Map<number, { marker: L.Marker; active: boolean; micro: number; selected: boolean }>
  >(new Map());
  const onSelectBusRef = useRef(onSelectBus);
  onSelectBusRef.current = onSelectBus;

  const focusPoint = useCallback((latlng: [number, number], targetZoom?: number) => {
    const map = mapRef.current;
    if (!map) return;
    const z = targetZoom ?? Math.max(map.getZoom(), 16);
    if (window.innerWidth < 768) {
      const pt = map.project(latlng, z);
      const offsetPt = L.point(pt.x, pt.y + 30);
      map.flyTo(map.unproject(offsetPt, z), z, { duration: 0.6 });
    } else {
      map.flyTo(latlng, z, { duration: 0.6 });
    }
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || mapRef.current) return;

    const map = L.map(el, {
      center: userPos,
      zoom: 16,
      zoomControl: false,
      attributionControl: true,
    });

    L.control.zoom({ position: 'topright' }).addTo(map);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap',
      maxZoom: 19,
    }).addTo(map);

    const circle = L.circle(userPos, {
      radius: Math.min(Math.max(accuracy ?? 45, 25), 250),
      color: '#3a6bff',
      fillColor: '#3a6bff',
      fillOpacity: 0.14,
      weight: 1,
      opacity: 0.35,
    }).addTo(map);

    const userMarker = L.marker(userPos, {
      icon: createUserIcon(),
      zIndexOffset: 500,
    }).addTo(map);

    mapRef.current = map;
    userMarkerRef.current = userMarker;
    accuracyCircleRef.current = circle;

    const ro = new ResizeObserver(() => {
      map.invalidateSize({ animate: false });
    });
    ro.observe(el);

    const busMap = busMarkersRef.current;
    return () => {
      ro.disconnect();
      busMap.clear();
      map.remove();
      mapRef.current = null;
      userMarkerRef.current = null;
      accuracyCircleRef.current = null;
    };
    // Inicialización única del mapa Leaflet
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!visible) return;
    const id = requestAnimationFrame(() => {
      mapRef.current?.invalidateSize({ animate: false });
    });
    return () => cancelAnimationFrame(id);
  }, [visible]);

  useEffect(() => {
    userMarkerRef.current?.setLatLng(userPos);
    if (accuracyCircleRef.current) {
      accuracyCircleRef.current.setLatLng(userPos);
      accuracyCircleRef.current.setRadius(Math.min(Math.max(accuracy ?? 45, 25), 250));
    }
  }, [userPos, accuracy]);

  useEffect(() => {
    if (centerNonce === 0) return;
    focusPoint(userPos, 16);
  }, [centerNonce, focusPoint, userPos]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const activeIds = new Set(buses.map((b) => b.id));
    busMarkersRef.current.forEach((entry, id) => {
      if (!activeIds.has(id)) {
        entry.marker.remove();
        busMarkersRef.current.delete(id);
      }
    });

    buses.forEach((b) => {
      const isActive = !!b.t;
      const isSelected = selectedBusId === b.id;
      const existing = busMarkersRef.current.get(b.id);
      const popupHtml = buildBusPopupHtml(b);
      const zOffset = isSelected ? 600 : isActive ? 400 : 300;

      if (existing) {
        existing.marker.setLatLng([b.lat, b.lng]);
        existing.marker.setZIndexOffset(zOffset);
        if (
          existing.active !== isActive ||
          existing.micro !== b.micro ||
          existing.selected !== isSelected
        ) {
          existing.marker.setIcon(createBusIcon(b.micro, isActive, isSelected));
          existing.active = isActive;
          existing.micro = b.micro;
          existing.selected = isSelected;
        }
        existing.marker.setPopupContent(popupHtml);
      } else {
        const marker = L.marker([b.lat, b.lng], {
          icon: createBusIcon(b.micro, isActive, isSelected),
          zIndexOffset: zOffset,
        })
          .bindPopup(popupHtml)
          .addTo(map);
        marker.on('click', () => {
          onSelectBusRef.current(b.id);
        });
        busMarkersRef.current.set(b.id, {
          marker,
          active: isActive,
          micro: b.micro,
          selected: isSelected,
        });
      }
    });
  }, [buses, selectedBusId]);

  useEffect(() => {
    if (selectedBusId === null || focusBusNonce === 0) return;
    const entry = busMarkersRef.current.get(selectedBusId);
    if (!entry) return;
    const pos = entry.marker.getLatLng();
    focusPoint([pos.lat, pos.lng]);
    entry.marker.openPopup();
  }, [selectedBusId, focusBusNonce, focusPoint]);

  return <div ref={containerRef} className="tolomosa-leaflet absolute inset-0 h-full w-full" />;
};

const Hero = ({ className = 'h-52 w-full shrink-0 md:h-64' }: { className?: string }) => (
  <svg
    viewBox="0 0 354 208"
    preserveAspectRatio="xMidYMid slice"
    className={className}
    aria-hidden="true"
  >
    <defs>
      <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#76bdf0" />
        <stop offset="1" stopColor="#d9eefd" />
      </linearGradient>
    </defs>
    <rect width="354" height="208" fill="url(#sky)" />
    <path d="M0 120 50 72 80 98 120 60 170 118z" fill="#6c7fb0" />
    <path d="M50 72 62 86 54 84 46 90zM120 60l14 16-9-3-8 6z" fill="#fff" />
    <path d="M200 118 250 64 290 100 330 76 354 96V130z" fill="#6c7fb0" />
    <path d="M250 64l12 14-8-3-7 7z" fill="#fff" />
    <rect y="116" width="354" height="50" fill="#79a84f" />
    <path d="M0 208 118 150h118l118 58z" fill="#585e68" />
    <path d="M0 208V176l120-30v4z" fill="#79a84f" />
    <g>
      <rect
        x="92"
        y="14"
        width="170"
        height="146"
        rx="24"
        fill="#f5f7fb"
        stroke="#c7d1e3"
        strokeWidth="2"
      />
      <rect x="104" y="24" width="146" height="20" rx="6" fill="#16203a" />
      <text
        x="177"
        y="40"
        textAnchor="middle"
        fontSize="15"
        fontWeight="800"
        fill="#fff"
        fontFamily="Nunito Sans,sans-serif"
      >
        Tolomosa
      </text>
      <rect x="104" y="48" width="146" height="62" rx="12" fill="#27415f" />
      <path d="M177 48v62" stroke="#0e1a2e" strokeWidth="3" />
      <rect x="92" y="116" width="170" height="22" fill="#1f5fd0" />
      <rect x="132" y="120" width="90" height="14" rx="5" fill="#0f2f78" />
      <circle cx="115" cy="148" r="9" fill="#fff" stroke="#9fb0cf" strokeWidth="2" />
      <circle cx="239" cy="148" r="9" fill="#fff" stroke="#9fb0cf" strokeWidth="2" />
      <rect x="82" y="40" width="10" height="26" rx="4" fill="#2a3550" />
      <rect x="262" y="40" width="10" height="26" rx="4" fill="#2a3550" />
    </g>
  </svg>
);

/* ---------- estado, validaciones, sincronización en tiempo real y utilidades ---------- */
const RAMALES = ['Tolomosa', 'Churquis', 'Pampa Redonda'];
const FLEET_MICROS = Array.from({ length: 36 }, (_, i) => i + 1);
const SEED_VEHICLES: Vehiculo[] = [
  { id: 12, numero: 12, ramal: 0, activo: true },
  { id: 17, numero: 17, ramal: 1, activo: true },
  { id: 21, numero: 21, ramal: 2, activo: true },
];
const SEED: Driver[] = [
  { id: 1, name: 'Juan Pérez', phone: '71823410', pin: '1234', micro: 12, ramal: 0, on: true, cap: '#1f5fd0' },
  { id: 2, name: 'Carlos Méndez', phone: '72945120', pin: '1234', micro: 17, ramal: 1, on: true, cap: '#1f5fd0' },
  { id: 3, name: 'Luis Vargas', phone: '68612345', pin: '1234', micro: 21, ramal: 2, on: true, cap: '#2a56b8' },
];
const CFG0: AppConfig = { coop: 'Transporte Tolomosa', notif: true };
const SYNC_CHANNEL = 'tolomosa_realtime_sync';
const T0 = Date.now();
const CODE = '1234';
const ADMIN_USER = 'admin';
const driverPin = (d?: Partial<Driver> | null) =>
  d?.pin && /^\d{4}$/.test(d.pin) ? d.pin : CODE;

/* Sincronización compartida en tiempo real entre vistas y pestañas */
function useSyncedShared<T>(key: string, init: T) {
  const [v, setV] = useState<T>(() => {
    try {
      const r = localStorage.getItem(key);
      return r ? (JSON.parse(r) as T) : init;
    } catch {
      return init;
    }
  });

  const setSynced = useCallback(
    (updater: React.SetStateAction<T>) => {
      setV((prev) => {
        const next =
          typeof updater === 'function' ? (updater as (p: T) => T)(prev) : updater;
        try {
          localStorage.setItem(key, JSON.stringify(next));
          if (typeof BroadcastChannel !== 'undefined') {
            const ch = new BroadcastChannel(SYNC_CHANNEL);
            ch.postMessage({ key, value: next });
            ch.close();
          }
        } catch {
          /* sin almacenamiento */
        }
        return next;
      });
    },
    [key]
  );

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === key && e.newValue !== null) {
        try {
          setV(JSON.parse(e.newValue) as T);
        } catch {
          /* ignorar */
        }
      }
    };

    let ch: BroadcastChannel | null = null;
    if (typeof BroadcastChannel !== 'undefined') {
      ch = new BroadcastChannel(SYNC_CHANNEL);
      ch.onmessage = (e: MessageEvent<{ key: string; value: T }>) => {
        if (e.data && e.data.key === key) {
          setV(e.data.value);
        }
      };
    }

    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('storage', onStorage);
      if (ch) ch.close();
    };
  }, [key]);

  return [v, setSynced] as const;
}

/* Estado persistente local (vista actual, sesión y chofer activo) */
function useLocalStored<T>(key: string, init: T) {
  const [v, setV] = useState<T>(() => {
    try {
      const r = localStorage.getItem(key);
      return r ? (JSON.parse(r) as T) : init;
    } catch {
      return init;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(v));
    } catch {
      /* sin almacenamiento */
    }
  }, [key, v]);
  return [v, setV] as const;
}

const vNombre = (s: string) =>
  !s.trim()
    ? 'Escribe el nombre'
    : s.trim().length < 3
      ? 'Mínimo 3 letras'
      : s.trim().length > 80
        ? 'Máximo 80 caracteres'
        : /\d/.test(s)
          ? 'No uses números'
          : '';

const vMicro = (v: string, ds: Driver[], id?: number) =>
  v === ''
    ? ''
    : !/^\d+$/.test(String(v))
      ? 'Solo números'
      : +v < 1 || +v > 36
        ? 'Debe estar entre 1 y 36'
        : ds.some((d) => d.micro === +v && d.id !== id)
          ? `El micro N° ${v} ya está asignado`
          : '';

const vTel = (s: string) =>
  !s.trim()
    ? 'Ingresa el teléfono'
    : /^\d{7,8}$/.test(s.trim())
      ? ''
      : 'Ingresa 7 u 8 dígitos numéricos';

const vPin = (s: string) =>
  /^\d{4}$/.test(s) ? '' : 'El PIN debe tener 4 dígitos numéricos';

const hm = (t: number) =>
  new Date(t).toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' });

const mins = (a: number, b: number) => Math.max(1, Math.round((b - a) / 60000));

const mmss = (ms: number) => {
  const t = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
};

const useNow = () => {
  const [n, setN] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setN(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return n;
};

const dirTxt = (d: Direction) =>
  d === 'campesino' ? 'Hacia el Campesino' : 'Hacia los Ramales';

/* Fórmula de Haversine para distancia real en metros entre dos coordenadas GPS */
const haversineMeters = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

/* ETA en minutos calculado a velocidad promedio de 25 km/h (≈ 416.67 m/min) */
const etaMinutes = (meters: number): number => Math.max(1, Math.round(meters / (25000 / 60)));

const formatDist = (meters: number): string =>
  meters >= 1000
    ? `${(meters / 1000).toFixed(1).replace('.', ',')} km`
    : `${Math.max(10, Math.round(meters / 10) * 10)} m`;

/* Caché local de última posición conocida de los micros para modo sin señal */
const LAST_BUS_POS_KEY = 'tt_last_bus_positions';
interface CachedBusPosition {
  lat: number;
  lng: number;
  ramal: number;
  micro: number;
}
type CachedBusMap = Record<number, CachedBusPosition>;

const readCachedBusPositions = (): CachedBusMap => {
  try {
    const raw = localStorage.getItem(LAST_BUS_POS_KEY);
    return raw ? (JSON.parse(raw) as CachedBusMap) : {};
  } catch {
    return {};
  }
};

const writeCachedBusPositions = (map: CachedBusMap) => {
  try {
    localStorage.setItem(LAST_BUS_POS_KEY, JSON.stringify(map));
  } catch {
    /* sin almacenamiento */
  }
};

/* Cola offline de coordenadas GPS del Chofer y escritura optimizada (< 200 bytes) a Firestore */
const GPS_QUEUE_KEY = 'tt_gps_offline_queue';
const LIVE_LOC_CACHE_KEY = 'tt_live_locations';
const MAX_GPS_QUEUE = 120;

const readGpsQueue = (): QueuedGpsPoint[] => {
  try {
    const raw = localStorage.getItem(GPS_QUEUE_KEY);
    return raw ? (JSON.parse(raw) as QueuedGpsPoint[]) : [];
  } catch {
    return [];
  }
};

const writeGpsQueue = (queue: QueuedGpsPoint[]) => {
  try {
    localStorage.setItem(GPS_QUEUE_KEY, JSON.stringify(queue.slice(-MAX_GPS_QUEUE)));
  } catch {
    /* sin almacenamiento */
  }
};

const readCachedLiveLocations = (): Record<number, LiveLocation> => {
  try {
    const raw = localStorage.getItem(LIVE_LOC_CACHE_KEY);
    return raw ? (JSON.parse(raw) as Record<number, LiveLocation>) : {};
  } catch {
    return {};
  }
};

const writeCachedLiveLocations = (map: Record<number, LiveLocation>) => {
  try {
    localStorage.setItem(LIVE_LOC_CACHE_KEY, JSON.stringify(map));
  } catch {
    /* sin almacenamiento */
  }
};

const buildCompactLocation = (
  lat: number,
  lng: number,
  enServicio: boolean,
  ramal: number,
  direccion: Direction
): LiveLocation => ({
  lat: Number(lat.toFixed(6)),
  lng: Number(lng.toFixed(6)),
  enServicio,
  ramal,
  direccion,
  actualizadoEn: Date.now(),
});

const isPermissionError = (err: unknown) =>
  err instanceof Error &&
  (err.message.toLowerCase().includes('permission') ||
    err.message.toLowerCase().includes('insufficient'));

async function syncUbicacionViva(driverId: number, payload: LiveLocation) {
  const path = `ubicaciones_vivas/${driverId}`;
  try {
    await setDoc(doc(db, 'ubicaciones_vivas', String(driverId)), payload);
  } catch (error) {
    if (isPermissionError(error)) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  }
}

async function syncChoferDoc(driver: Driver) {
  const path = `choferes/${driver.id}`;
  const cleanName = driver.name.trim().slice(0, 80);
  const clean: Driver = {
    id: driver.id,
    name: cleanName.length >= 3 ? cleanName : 'Chofer',
    phone: (driver.phone ?? '').slice(0, 20),
    pin: driverPin(driver),
    micro: driver.micro,
    ramal: Math.max(0, Math.min(2, Math.trunc(driver.ramal))),
    on: !!driver.on,
    cap: (driver.cap || '#1f5fd0').slice(0, 20),
  };
  try {
    await setDoc(doc(db, 'choferes', String(driver.id)), clean);
  } catch (error) {
    if (isPermissionError(error)) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  }
}

async function deleteChoferDoc(driverId: number) {
  const path = `choferes/${driverId}`;
  try {
    await deleteDoc(doc(db, 'choferes', String(driverId)));
  } catch (error) {
    if (isPermissionError(error)) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  }
}

async function syncVehiculoDoc(vehiculo: Vehiculo) {
  const path = `vehiculos/${vehiculo.id}`;
  const clean: Vehiculo = {
    id: Math.max(1, Math.trunc(vehiculo.id)),
    numero: Math.max(1, Math.min(36, Math.trunc(vehiculo.numero))),
    ramal: Math.max(0, Math.min(2, Math.trunc(vehiculo.ramal))),
    activo: !!vehiculo.activo,
  };
  try {
    await setDoc(doc(db, 'vehiculos', String(clean.id)), clean);
  } catch (error) {
    if (isPermissionError(error)) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  }
}

async function deleteVehiculoDoc(vehiculoId: number) {
  const path = `vehiculos/${vehiculoId}`;
  try {
    await deleteDoc(doc(db, 'vehiculos', String(vehiculoId)));
  } catch (error) {
    if (isPermissionError(error)) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  }
}

async function syncJornadaDoc(jornada: Jornada) {
  const path = `jornadas/${jornada.k}`;
  const clean: Jornada = {
    ...jornada,
    name: jornada.name.trim().slice(0, 80) || 'Chofer',
    ramal: Math.max(0, Math.min(2, Math.trunc(jornada.ramal))),
    end: Math.max(jornada.start, jornada.end),
  };
  try {
    await setDoc(doc(db, 'jornadas', String(jornada.k)), clean);
  } catch (error) {
    if (isPermissionError(error)) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  }
}

async function deleteJornadaDoc(jornadaKey: number) {
  const path = `jornadas/${jornadaKey}`;
  try {
    await deleteDoc(doc(db, 'jornadas', String(jornadaKey)));
  } catch (error) {
    if (isPermissionError(error)) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  }
}

const useOnlineStatus = () => {
  const [online, setOnline] = useState(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
};

/* Timbre sonoro de 3 tonos claros y suaves generado con Web Audio API (sin archivos externos) */
const getAudioCtx = (ref: React.MutableRefObject<AudioContext | null>) => {
  if (typeof window === 'undefined') return null;
  if (!ref.current) {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (Ctor) ref.current = new Ctor();
  }
  if (ref.current && ref.current.state === 'suspended') {
    ref.current.resume().catch(() => {
      /* ignorar bloqueo de audio */
    });
  }
  return ref.current;
};

const playProximityChime = (ref: React.MutableRefObject<AudioContext | null>) => {
  const ctx = getAudioCtx(ref);
  if (!ctx) return;
  const freqs = [660, 880, 1046.5];
  const base = ctx.currentTime + 0.02;
  freqs.forEach((f, idx) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(f, base + idx * 0.24);
    gain.gain.setValueAtTime(0.001, base + idx * 0.24);
    gain.gain.exponentialRampToValueAtTime(0.24, base + idx * 0.24 + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.001, base + idx * 0.24 + 0.22);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(base + idx * 0.24);
    osc.stop(base + idx * 0.24 + 0.23);
  });
};

const Modal = ({
  title,
  onClose,
  bare = false,
  children,
}: {
  title: string;
  onClose: () => void;
  bare?: boolean;
  children: React.ReactNode;
}) => {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);
  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-[#0a1630]/55 sm:items-center sm:p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className={`max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-[26px] bg-white sm:rounded-[26px] ${
          bare
            ? 'pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:pb-5'
            : 'px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4 sm:pb-5'
        }`}
      >
        {!bare && <h2 className="mb-2 text-[21px] font-extrabold text-[#11203f]">{title}</h2>}
        {children}
      </div>
    </div>
  );
};

const Input = ({
  label,
  error,
  ...p
}: React.InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  error?: string | boolean;
}) => (
  <label className="mb-3 block">
    <span className="text-[14px] font-semibold text-[#5f6f8a]">{label}</span>
    <input
      {...p}
      aria-invalid={!!error}
      className={`mt-1 h-12 w-full rounded-[12px] border bg-white px-3 text-[17px] font-semibold text-[#11203f] outline-none focus:ring-2 focus:ring-[#0b5bdb] ${
        error ? 'border-[#c0332b]' : 'border-[#d3e0f4]'
      }`}
    />
    {error && (
      <span role="alert" className="mt-1 block text-[13px] font-semibold text-[#c0332b]">
        {error}
      </span>
    )}
  </label>
);

const Btn = ({
  tone = 'blue',
  className = '',
  ...p
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  tone?: 'blue' | 'ghost' | 'ghostRed' | 'red' | 'green';
}) => (
  <button
    type="button"
    {...p}
    className={`h-12 rounded-[14px] px-3 text-[16px] font-bold disabled:opacity-50 ${
      {
        blue: 'bg-[#0b5bdb] text-white',
        ghost: 'bg-[#e8ebf0] text-[#11203f]',
        ghostRed: 'bg-[#e8ebf0] text-[#c0332b]',
        red: 'bg-[#c0332b] text-white',
        green: 'bg-[#16a34a] text-white',
      }[tone]
    } ${className}`}
  />
);

const Confirm = ({
  title,
  text,
  ok,
  tone = 'blue',
  onOk,
  onClose,
}: {
  title: string;
  text: string;
  ok: string;
  tone?: 'blue' | 'red' | 'green';
  onOk: () => void;
  onClose: () => void;
}) => (
  <Modal title={title} onClose={onClose}>
    <p className="mb-4 text-[16px] leading-snug text-[#5f6f8a]">{text}</p>
    <div className="grid grid-cols-2 gap-2">
      <Btn tone="ghost" onClick={onClose}>
        Cancelar
      </Btn>
      <Btn tone={tone} onClick={onOk}>
        {ok}
      </Btn>
    </div>
  </Modal>
);

const Pick = ({
  label,
  value,
  onChange,
  children,
  disabled,
}: {
  label: string;
  value: string | number;
  onChange: React.ChangeEventHandler<HTMLSelectElement>;
  children: React.ReactNode;
  disabled?: boolean;
}) => (
  <select
    aria-label={label}
    value={value}
    disabled={disabled}
    onChange={onChange}
    className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
  >
    {children}
  </select>
);

/* ---------- pantallas ---------- */
type SheetSnap = 'min' | 'mid' | 'max';

const Pasajero = ({
  drivers,
  trip,
  liveLocations,
  now,
  auth,
  setAuth,
  view,
  go,
  toast,
  say,
}: {
  drivers: Driver[];
  trip: ActiveTrip | null;
  liveLocations: Record<number, LiveLocation>;
  now: number;
  auth: AuthState;
  setAuth: (a: AuthState) => void;
  view: RoleView;
  go: (v: RoleView) => void;
  toast: ToastState | null;
  say: (phone: RoleView, msg: string, tone?: 'ok' | 'err') => void;
}) => {
  const [dest, setDest] = useState('Campesino');
  const [q, setQ] = useState('Campesino');
  const [busy, setBusy] = useState(false);
  const [modal, setModal] = useState(false);
  const [userPos, setUserPos] = useState<[number, number]>(DEFAULT_POS);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [selectedBusId, setSelectedBusId] = useState<number | null>(null);
  const [focusBusNonce, setFocusBusNonce] = useState(0);
  const [centerNonce, setCenterNonce] = useState(0);
  const [sheetSnap, setSheetSnap] = useState<SheetSnap>('min');
  const [dragOffsetPx, setDragOffsetPx] = useState<number | null>(null);
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth < 768 : true
  );
  const [alertBusId, setAlertBusId] = useState<number | null>(null);
  const [alertTriggered, setAlertTriggered] = useState<{
    busId: number;
    micro: number;
    m: number;
  } | null>(null);
  const isOnline = useOnlineStatus();
  const cachedPositionsRef = useRef<CachedBusMap>(readCachedBusPositions());
  const audioCtxRef = useRef<AudioContext | null>(null);
  const gpsLockedRef = useRef(false);
  const dragRef = useRef<{
    startY: number;
    basePx: number;
    minPx: number;
    midPx: number;
    lastDy: number;
    moved: boolean;
  } | null>(null);
  const suppressClickRef = useRef(false);

  // Cerrar modal y minimizar Bottom Sheet al cambiar de rol/vista
  useEffect(() => {
    if (view !== 'pas') {
      setModal(false);
      setSheetSnap('min');
    }
  }, [view]);

  // Detectar viewport móvil (< 768px) para aplicar transform del Bottom Sheet solo en móvil
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const sync = () => setIsMobile(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  // Seguimiento en tiempo real de la ubicación del pasajero
  useEffect(() => {
    if (!navigator.geolocation) return;
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setUserPos([pos.coords.latitude, pos.coords.longitude]);
        setAccuracy(pos.coords.accuracy);
        if (!gpsLockedRef.current) {
          gpsLockedRef.current = true;
          setCenterNonce((c) => c + 1);
        }
      },
      () => {
        /* Si no hay permiso aún, se mantiene la ubicación base en Tarija */
      },
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 10000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  const compute = useCallback(
    (d: string) => {
      const targetRamalIdx = RAMALES.indexOf(d.replace('Ramal ', ''));
      const [uLat, uLng] = userPos;
      const metersPerLat = 111320;
      const metersPerLng = 111320 * Math.cos((uLat * Math.PI) / 180) || 111320;

      return drivers
        .filter((x): x is Driver & { micro: number } => x.on && x.micro !== null)
        .map((x) => {
          const live = liveLocations[x.id];
          const localTrip =
            trip && (trip.driverId === x.id || trip.micro === x.micro) ? trip : null;
          const liveTrip: ActiveTrip | null =
            live && live.enServicio
              ? {
                  driverId: x.id,
                  name: x.name,
                  micro: x.micro,
                  ramal: live.ramal,
                  dir: live.direccion,
                  start: localTrip?.start ?? live.actualizadoEn,
                }
              : localTrip;
          return {
            ...x,
            t: liveTrip,
            live,
            ramal: liveTrip ? liveTrip.ramal : x.ramal,
          };
        })
        .filter((x) =>
          d === 'Campesino'
            ? !x.t || x.t.dir === 'campesino'
            : x.ramal === targetRamalIdx && (!x.t || x.t.dir === 'ramales')
        )
        .map((x) => {
          const cached = cachedPositionsRef.current[x.id];
          let lat: number;
          let lng: number;
          let a: number;

          if (x.live && x.live.enServicio) {
            lat = x.live.lat;
            lng = x.live.lng;
            a = Math.atan2(lat - uLat, lng - uLng);
          } else if (!isOnline && cached) {
            lat = cached.lat;
            lng = cached.lng;
            a = Math.atan2(lat - uLat, lng - uLng);
          } else {
            // Movimiento realista a 25 km/h (6.94 m/s) en corredor de 100 m a 1.15 km
            const base = 360 + ((x.micro * 73) % 780);
            const el = (now - (x.t ? x.t.start : T0)) / 1000;
            const rawM = 100 + ((((base - 100 - el * 6.94) % 1050) + 1050) % 1050);
            const baseAngle = x.t
              ? x.t.dir === 'campesino'
                ? 3.3
                : 6.0
              : [3.5, 5.6, 2.3][x.micro % 3];
            a = baseAngle + Math.sin(el * 0.08 + x.micro) * 0.22;
            lat = uLat + (rawM * Math.sin(a)) / metersPerLat;
            lng = uLng + (rawM * Math.cos(a)) / metersPerLng;
          }

          const m = Math.round(haversineMeters(uLat, uLng, lat, lng));
          const eta = etaMinutes(m);

          return {
            ...x,
            m,
            eta,
            a,
            lat,
            lng,
          };
        })
        .sort((a, b) => a.m - b.m)
        .slice(0, 6);
    },
    [drivers, trip, liveLocations, now, userPos, isOnline]
  );

  const list = useMemo(() => compute(q), [compute, q]);

  // Guardar última posición conocida de los micros en localStorage cuando hay conexión
  useEffect(() => {
    if (!isOnline || list.length === 0) return;
    const next: CachedBusMap = { ...cachedPositionsRef.current };
    list.forEach((b) => {
      next[b.id] = { lat: b.lat, lng: b.lng, ramal: b.ramal, micro: b.micro };
    });
    cachedPositionsRef.current = next;
    writeCachedBusPositions(next);
  }, [isOnline, list]);

  const selectedBus = useMemo(
    () => list.find((b) => b.id === selectedBusId) ?? null,
    [list, selectedBusId]
  );

  // Monitorear proximidad <= 500 m del micro con alerta activada
  useEffect(() => {
    if (alertBusId === null || alertTriggered !== null) return;
    const target = list.find((b) => b.id === alertBusId);
    if (target && target.m <= 500) {
      setAlertTriggered({ busId: target.id, micro: target.micro, m: target.m });
    }
  }, [alertBusId, alertTriggered, list]);

  // Reproducir timbre repetitivo de 3 tonos (Web Audio API) y vibración prolongada mientras la alerta está activa
  useEffect(() => {
    if (!alertTriggered) return;
    const triggerSignals = () => {
      playProximityChime(audioCtxRef);
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        navigator.vibrate([400, 200, 400, 200, 400]);
      }
    };
    triggerSignals();
    const id = setInterval(triggerSignals, 3800);
    return () => {
      clearInterval(id);
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        navigator.vibrate(0);
      }
    };
  }, [alertTriggered]);

  const liveTriggeredBus = alertTriggered
    ? list.find((b) => b.id === alertTriggered.busId) ?? null
    : null;

  const dismissAlert = () => {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(0);
    }
    setAlertTriggered(null);
    setAlertBusId(null);
  };

  const toggleAlertForSelected = (busId: number, micro: number) => {
    getAudioCtx(audioCtxRef);
    if (alertBusId === busId) {
      setAlertBusId(null);
      say('pas', `Alerta desactivada para Micro N° ${micro}`);
    } else {
      setAlertBusId(busId);
      say('pas', `Te avisaremos cuando el Micro N° ${micro} esté a 500 m`);
    }
  };

  const buscar = () => {
    if (busy) return;
    setBusy(true);
    setSheetSnap('mid');
    setTimeout(() => {
      setQ(dest);
      setSelectedBusId(null);
      setBusy(false);
      const n = compute(dest).length;
      say(
        'pas',
        n
          ? `${n} micro${n > 1 ? 's' : ''} disponible${n > 1 ? 's' : ''} hacia ${dest}`
          : `No hay micros disponibles hacia ${dest}`,
        n ? 'ok' : 'err'
      );
    }, 600);
  };

  const locate = () => {
    setSelectedBusId(null);
    if (!navigator.geolocation) {
      setCenterNonce((c) => c + 1);
      return say('pas', 'Este dispositivo no tiene GPS', 'err');
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        gpsLockedRef.current = true;
        setUserPos([pos.coords.latitude, pos.coords.longitude]);
        setAccuracy(pos.coords.accuracy);
        setCenterNonce((c) => c + 1);
        say('pas', 'Ubicación actualizada');
      },
      () => {
        setCenterNonce((c) => c + 1);
        say('pas', 'No pudimos ubicarte. Activa el permiso de ubicación', 'err');
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  const getSnapMetrics = () => {
    const vh = window.innerHeight || 760;
    const minPx = Math.max(0, vh * 0.8 - 76);
    const midPx = Math.max(0, vh * 0.3);
    const basePx = sheetSnap === 'max' ? 0 : sheetSnap === 'mid' ? midPx : minPx;
    return { minPx, midPx, basePx };
  };

  const handleSheetTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!isMobile || e.touches.length !== 1) return;
    const { minPx, midPx, basePx } = getSnapMetrics();
    dragRef.current = {
      startY: e.touches[0].clientY,
      basePx,
      minPx,
      midPx,
      lastDy: 0,
      moved: false,
    };
  };

  const handleSheetTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    const st = dragRef.current;
    if (!st || !isMobile) return;
    const dy = e.touches[0].clientY - st.startY;
    st.lastDy = dy;
    if (Math.abs(dy) > 6) st.moved = true;
    const nextPx = Math.max(0, Math.min(st.minPx, st.basePx + dy));
    setDragOffsetPx(nextPx);
  };

  const handleSheetTouchEnd = () => {
    const st = dragRef.current;
    dragRef.current = null;
    if (!st) return;

    if (!st.moved) {
      setDragOffsetPx(null);
      return;
    }

    suppressClickRef.current = true;
    const finalPx = Math.max(0, Math.min(st.minPx, st.basePx + st.lastDy));
    let nextSnap: SheetSnap = sheetSnap;

    if (st.lastDy < -40) {
      nextSnap = st.lastDy < -180 || sheetSnap === 'mid' ? 'max' : 'mid';
    } else if (st.lastDy > 40) {
      nextSnap = st.lastDy > 180 || sheetSnap === 'mid' ? 'min' : 'mid';
    } else {
      const dists: Array<[SheetSnap, number]> = [
        ['max', Math.abs(finalPx - 0)],
        ['mid', Math.abs(finalPx - st.midPx)],
        ['min', Math.abs(finalPx - st.minPx)],
      ];
      dists.sort((a, b) => a[1] - b[1]);
      nextSnap = dists[0][0];
    }

    setSheetSnap(nextSnap);
    setDragOffsetPx(null);
  };

  const toggleSheetHeader = () => {
    if (!isMobile) return;
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    setSheetSnap((s) => (s === 'min' ? 'mid' : 'min'));
  };

  const mobileTransform =
    dragOffsetPx !== null
      ? `translateY(${dragOffsetPx}px)`
      : sheetSnap === 'max'
        ? 'translateY(0px)'
        : sheetSnap === 'mid'
          ? 'translateY(30dvh)'
          : 'translateY(calc(80dvh - 78px - env(safe-area-inset-bottom, 0px)))';

  return (
    <AppShell
      toast={toast}
      lift={88}
      overlay={
        <>
          {modal && (
            <ProfileModal
              drivers={drivers}
              auth={auth}
              setAuth={setAuth}
              go={go}
              say={say}
              onClose={() => setModal(false)}
            />
          )}
          {alertTriggered && (
            <div
              role="alertdialog"
              aria-modal="true"
              aria-label="Alerta de proximidad de micro"
              className="fixed inset-0 z-[1200] flex items-center justify-center bg-[#0a1630]/80 p-4"
            >
              <div className="w-full max-w-md rounded-[26px] border-4 border-[#facc15] bg-white p-6 text-center shadow-2xl">
                <div className="mx-auto mb-3 grid h-16 w-16 animate-bounce place-items-center rounded-full bg-[#fef08a] text-[#b45309]">
                  {Ic.bell('h-10 w-10')}
                </div>
                <h2 className="text-[24px] font-extrabold leading-tight text-[#11203f]">
                  ¡Prepárate! El Micro N° {alertTriggered.micro} está a menos de 500 metros
                </h2>
                <p className="mt-2.5 text-[18px] font-bold text-[#0b4bbf]">
                  A {formatDist(liveTriggeredBus?.m ?? alertTriggered.m)} · ~
                  {liveTriggeredBus?.eta ?? etaMinutes(alertTriggered.m)} min
                </p>
                <button
                  type="button"
                  onClick={dismissAlert}
                  className="mt-5 flex h-14 w-full items-center justify-center rounded-2xl bg-[#16a34a] px-4 text-[20px] font-extrabold text-white shadow-[0_6px_16px_rgba(22,163,74,.4)] active:scale-[0.99]"
                >
                  Entendido / Silenciar
                </button>
              </div>
            </div>
          )}
        </>
      }
    >
      <div className="flex min-h-dvh flex-col">
        <Header
          icon={Ic.bus('h-12 w-12 [--win:#0b4bbf]')}
          title={
            <>
              Transporte <span className="md:hidden"><br /></span>Tolomosa
            </>
          }
          action={
            <button
              type="button"
              aria-label="Mi perfil"
              onClick={() => setModal(true)}
              className="shrink-0 text-white"
            >
              {Ic.user('h-9 w-9')}
            </button>
          }
        />

        {!isOnline && (
          <div
            role="status"
            className="flex w-full items-center justify-center gap-2 border-b border-[#f59e0b]/40 bg-[#fef3c7] px-4 py-1.5 text-center text-[13.5px] font-bold text-[#92400e]"
          >
            <span className="h-2 w-2 shrink-0 rounded-full bg-[#d97706]" />
            Modo sin conexión — última ubicación conocida
          </div>
        )}

        <div className="flex flex-1 flex-col md:mx-auto md:grid md:w-full md:max-w-6xl md:grid-cols-12 md:gap-6 md:px-6 md:py-6">
          {/* Columna izquierda en tablet/PC (en móvil: buscador arriba + Bottom Sheet fijo abajo) */}
          <div className="contents md:col-span-5 md:flex md:flex-col md:gap-4">
            <section className="relative z-10 -mt-2 rounded-t-[26px] bg-[#e9f1fd] px-3.5 pb-3.5 pt-3.5 md:mt-0 md:rounded-[24px] md:border md:border-[#d3e0f4] md:bg-white md:p-4 md:shadow-sm">
              <div className="space-y-2">
                <Field
                  icon={Ic.pin('h-6 w-6 text-[#0b4bbf]')}
                  tint="bg-[#e4edfb]"
                  label="Origen"
                  value="Mi ubicación actual"
                  right={Ic.target('h-8 w-8')}
                  onRight={locate}
                  rightLabel="Actualizar mi ubicación"
                />
                <Field
                  icon={Ic.pin('h-6 w-6 text-[#16a34a]')}
                  tint="bg-[#e4f4ea]"
                  label="Destino"
                  value={dest}
                  right={Ic.chevron('h-6 w-6 text-[#11203f]')}
                >
                  <Pick
                    label="Destino"
                    value={dest}
                    onChange={(e) => {
                      const val = e.target.value;
                      setDest(val);
                      setQ(val);
                      setSelectedBusId(null);
                    }}
                  >
                    <option>Campesino</option>
                    {RAMALES.map((r) => (
                      <option key={r}>Ramal {r}</option>
                    ))}
                  </Pick>
                </Field>
              </div>
              <button
                type="button"
                onClick={buscar}
                disabled={busy}
                className="mt-3 flex h-[52px] w-full items-center justify-center gap-2 rounded-2xl bg-[#0b5bdb] text-[19px] font-bold text-white shadow-[0_4px_10px_rgba(11,91,219,.35)] disabled:opacity-70"
              >
                {Ic.search('h-6 w-6')} {busy ? 'Buscando…' : 'Buscar Micros'}
              </button>
            </section>

            {/* Bottom Sheet deslizable en móvil (< 768px) y tarjeta con scroll en tablet/PC (>= 768px) */}
            <section
              style={isMobile ? { transform: mobileTransform } : undefined}
              className={`fixed bottom-0 left-0 right-0 z-20 flex h-[80dvh] flex-col overflow-hidden rounded-t-3xl bg-white px-3.5 shadow-2xl ${
                dragOffsetPx !== null ? 'transition-none' : 'transition-transform duration-300 ease-out'
              } ${
                sheetSnap === 'mid'
                  ? 'pb-[calc(30dvh+max(0.75rem,env(safe-area-inset-bottom)))]'
                  : 'pb-[max(0.75rem,env(safe-area-inset-bottom))]'
              } md:static md:z-auto md:h-auto md:flex-1 md:rounded-[24px] md:border md:border-[#e1e8f3] md:p-4 md:pb-4 md:shadow-sm md:transition-none`}
            >
              {/* Barra tirador y encabezado fijo del Bottom Sheet */}
              <div
                onTouchStart={handleSheetTouchStart}
                onTouchMove={handleSheetTouchMove}
                onTouchEnd={handleSheetTouchEnd}
                onClick={toggleSheetHeader}
                role={isMobile ? 'button' : undefined}
                tabIndex={isMobile ? 0 : undefined}
                aria-expanded={isMobile ? sheetSnap !== 'min' : undefined}
                aria-label={
                  isMobile ? 'Desliza o toca para ver los micros más cercanos' : undefined
                }
                onKeyDown={(e) => {
                  if (isMobile && (e.key === 'Enter' || e.key === ' ')) {
                    e.preventDefault();
                    toggleSheetHeader();
                  }
                }}
                className="shrink-0 touch-none select-none pb-2 pt-0.5 md:cursor-default md:touch-auto md:pb-2 md:pt-0"
              >
                <div className="mx-auto my-2 h-1.5 w-12 rounded-full bg-gray-300 md:hidden" />
                <h2 className="flex items-center gap-2 text-[18px] font-bold text-[#11203f]">
                  <span className="shrink-0 text-[#16a34a]">{Ic.check('h-7 w-7')}</span>
                  <span className="truncate">Micros más cercanos</span>
                  <span className="ml-auto inline-flex min-w-[28px] items-center justify-center rounded-full bg-[#e9f1fd] px-2.5 py-0.5 text-[13.5px] font-extrabold text-[#0b4bbf]">
                    {list.length}
                  </span>
                </h2>
              </div>

              <ul className="min-h-0 flex-1 divide-y divide-[#e6ecf6] overflow-y-auto overscroll-contain rounded-[14px] border border-[#e1e8f3] md:max-h-[60vh]">
                {list.length === 0 && (
                  <li className="px-3 py-5 text-center text-[15px] font-semibold text-[#5f6f8a]">
                    No hay micros disponibles hacia {q}
                  </li>
                )}
                {list.map((d) => {
                  const isSelected = selectedBusId === d.id;
                  return (
                    <li key={d.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedBusId(d.id);
                          setFocusBusNonce((n) => n + 1);
                          if (isMobile) setSheetSnap('min');
                          say(
                            'pas',
                            `Micro N° ${d.micro} · A ${formatDist(d.m)} · ~${d.eta} min`
                          );
                        }}
                        className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-[#f7faff] ${
                          isSelected
                            ? 'border-l-4 border-l-[#0b4bbf] bg-[#e9f1fd]'
                            : ''
                        }`}
                      >
                        <span className="shrink-0 text-[#0b4bbf]">
                          {Ic.bus('h-9 w-9 [--win:#fff]')}
                        </span>
                        <div className="min-w-0 flex-1 leading-tight">
                          <div className="flex items-center gap-1.5 text-[17px] font-bold text-[#11203f]">
                            <span>Micro N° {d.micro}</span>
                            {alertBusId === d.id && (
                              <span
                                className="inline-flex items-center text-[#16a34a]"
                                title="Alerta de 500 m activa"
                              >
                                {Ic.bell('h-4 w-4')}
                              </span>
                            )}
                          </div>
                          <div className="text-[14.5px] font-bold text-[#0b4bbf]">
                            A {formatDist(d.m)} · ~{d.eta} min
                          </div>
                          <div className="truncate text-[13px] text-[#5f6f8a]">
                            {d.t
                              ? `Ramal ${RAMALES[d.ramal]} · ${mmss(now - d.t.start)}`
                              : `Ramal ${RAMALES[d.ramal]}`}
                          </div>
                        </div>
                        <Chip on={!!d.t}>{d.t ? 'En servicio' : 'Disponible'}</Chip>
                      </button>
                    </li>
                  );
                })}
              </ul>
              <div className="mt-2.5 flex shrink-0 items-center gap-2 overflow-hidden rounded-[14px] bg-[#e4eefc] px-3 py-2">
                <span className="shrink-0 text-[#1b6fe8]">{Ic.info('h-7 w-7')}</span>
                <span className="text-[17px] font-bold italic text-[#0b4bbf]">¡Viaje seguro!</span>
                <Ridge className="ml-auto h-8 w-24 shrink-0" />
              </div>
            </section>
          </div>

          {/* Columna derecha en tablet/PC: mapa interactivo Leaflet ocupando todo el alto disponible */}
          <section className="relative z-0 min-h-80 flex-1 overflow-hidden md:col-span-7 md:min-h-[520px] md:rounded-[24px] md:border md:border-[#d3e0f4] md:shadow-sm">
            <TolomosaMap
              userPos={userPos}
              accuracy={accuracy}
              buses={list}
              selectedBusId={selectedBusId}
              focusBusNonce={focusBusNonce}
              onSelectBus={(id) => {
                setSelectedBusId(id);
                if (isMobile) setSheetSnap('min');
              }}
              centerNonce={centerNonce}
              visible={view === 'pas'}
            />

            {/* Tarjeta flotante de seguimiento del micro seleccionado sobre el mapa */}
            {selectedBus && (
              <div className="absolute left-3 right-14 top-3 z-[500] rounded-[20px] border border-[#d3e0f4] bg-white/95 p-3.5 shadow-xl backdrop-blur-sm md:left-4 md:right-auto md:w-[350px]">
                <div className="flex items-start gap-2.5">
                  <span className="mt-0.5 shrink-0 text-[#0b4bbf]">
                    {Ic.bus('h-9 w-9 [--win:#fff]')}
                  </span>
                  <div className="min-w-0 flex-1 leading-tight">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[18px] font-extrabold text-[#11203f]">
                        Micro N° {selectedBus.micro}
                      </span>
                      <Chip on={!!selectedBus.t}>
                        {selectedBus.t ? 'En servicio' : 'Disponible'}
                      </Chip>
                    </div>
                    <p className="mt-0.5 truncate text-[13.5px] font-semibold text-[#5f6f8a]">
                      Ramal {RAMALES[selectedBus.ramal]}
                      {selectedBus.t ? ` · ${dirTxt(selectedBus.t.dir)}` : ''}
                    </p>
                    <p className="mt-1 text-[16px] font-extrabold text-[#0b4bbf]">
                      A {formatDist(selectedBus.m)} · ~{selectedBus.eta} min
                    </p>
                  </div>
                  <button
                    type="button"
                    aria-label="Cerrar seguimiento del micro"
                    onClick={() => setSelectedBusId(null)}
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#eef3fc] text-[#5f6f8a] hover:bg-[#e1e8f3]"
                  >
                    {Ic.close('h-5 w-5')}
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => toggleAlertForSelected(selectedBus.id, selectedBus.micro)}
                  className={`mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-[14px] px-4 py-2 text-[16px] font-extrabold text-white shadow-sm transition-colors ${
                    alertBusId === selectedBus.id
                      ? 'bg-[#16a34a] hover:bg-[#15803d]'
                      : 'bg-[#0b5bdb] hover:bg-[#0b4bbf]'
                  }`}
                >
                  {Ic.bell('h-5 w-5 shrink-0')}
                  {alertBusId === selectedBus.id
                    ? 'Alerta activa a 500 m (cancelar)'
                    : 'Avisarme a 500 m'}
                </button>
                {alertBusId === selectedBus.id && (
                  <button
                    type="button"
                    onClick={() => {
                      getAudioCtx(audioCtxRef);
                      setAlertTriggered({
                        busId: selectedBus.id,
                        micro: selectedBus.micro,
                        m: Math.min(selectedBus.m, 480),
                      });
                    }}
                    className="mt-2 flex h-10 w-full items-center justify-center rounded-[12px] border border-[#d3e0f4] bg-[#eef4fe] px-3 text-[14px] font-bold text-[#0b4bbf] hover:bg-[#e1ecfd]"
                  >
                    Probar alerta de llegada ahora
                  </button>
                )}
              </div>
            )}

            <button
              type="button"
              aria-label="Centrar en mi ubicación"
              onClick={locate}
              className="absolute bottom-24 left-3 z-[500] grid h-11 w-11 place-items-center rounded-full bg-white text-[#11203f] shadow-md md:bottom-4 md:left-4"
            >
              {Ic.arrow('h-6 w-6')}
            </button>
          </section>
        </div>
      </div>
    </AppShell>
  );
};

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

const usePWAInstall = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    setIsInstalled(standalone);
    setIsIOS(/iphone|ipad|ipod/.test(window.navigator.userAgent.toLowerCase()));

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const install = async () => {
    if (!deferredPrompt) return false;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setIsInstalled(true);
      setDeferredPrompt(null);
      return true;
    }
    return false;
  };

  return { isInstallable: !!deferredPrompt, isInstalled, isIOS, install };
};

const ProfileModal = ({
  drivers,
  onClose,
  auth,
  setAuth,
  go,
  say,
}: {
  drivers: Driver[];
  onClose: () => void;
  auth: AuthState;
  setAuth: (a: AuthState) => void;
  go: (v: RoleView) => void;
  say: (phone: RoleView, msg: string, tone?: 'ok' | 'err') => void;
}) => {
  const [roleTab, setRoleTab] = useState<'chof' | 'adm'>(() =>
    auth.adm && !auth.chof ? 'adm' : 'chof'
  );
  const [selectedDriverId, setSelectedDriverId] = useState<number>(() => {
    if (auth.driverId && drivers.some((d) => d.id === auth.driverId)) return auth.driverId;
    return drivers[0]?.id ?? 1;
  });
  const [adminUser, setAdminUser] = useState('');
  const [pin, setPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [errMsg, setErrMsg] = useState('');
  const [iosGuide, setIosGuide] = useState(false);
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();

  const selectedDriver = useMemo(
    () => drivers.find((d) => d.id === selectedDriverId) || drivers[0] || null,
    [drivers, selectedDriverId]
  );

  useEffect(() => {
    if (drivers.length > 0 && !drivers.some((d) => d.id === selectedDriverId)) {
      setSelectedDriverId(drivers[0].id);
    }
  }, [drivers, selectedDriverId]);

  const switchTab = (next: 'chof' | 'adm') => {
    setRoleTab(next);
    setPin('');
    setErrMsg('');
  };

  const pressDigit = (d: string) => {
    setErrMsg('');
    setPin((prev) => (prev.length < 4 ? prev + d : prev));
  };

  const backspacePin = () => {
    setErrMsg('');
    setPin((prev) => prev.slice(0, -1));
  };

  const clearPin = () => {
    setErrMsg('');
    setPin('');
  };

  const fillDemoData = () => {
    setErrMsg('');
    if (roleTab === 'chof') {
      const preferred =
        selectedDriver || drivers.find((d) => d.on && d.micro !== null) || drivers[0];
      if (preferred) {
        setSelectedDriverId(preferred.id);
        setPin(driverPin(preferred));
      } else {
        setPin(CODE);
      }
    } else {
      setAdminUser(ADMIN_USER);
      setPin(CODE);
    }
  };

  const resumeActiveSession = (target: 'chof' | 'adm') => {
    go(target);
    onClose();
    if (target === 'chof' && selectedDriver) {
      say(
        'chof',
        `Bienvenido, ${selectedDriver.name}${
          selectedDriver.micro !== null ? ` · Micro N° ${selectedDriver.micro}` : ''
        }`
      );
    } else {
      say('adm', 'Vista de Administrador');
    }
  };

  const enterChofer = () => {
    if (!selectedDriver) {
      setErrMsg('No hay choferes registrados disponibles');
      return;
    }
    if (!/^\d{4}$/.test(pin)) {
      setErrMsg('Ingresa el PIN numérico de 4 dígitos');
      return;
    }
    if (pin !== driverPin(selectedDriver)) {
      setErrMsg('PIN incorrecto. Verifica los 4 dígitos asignados e intenta de nuevo.');
      return;
    }
    setAuth({ ...auth, chof: true, driverId: selectedDriver.id });
    go('chof');
    onClose();
    say(
      'chof',
      `Sesión iniciada · ${selectedDriver.name}${
        selectedDriver.micro !== null ? ` (Micro N° ${selectedDriver.micro})` : ''
      }`
    );
  };

  const enterAdmin = () => {
    const cleanUser = adminUser.trim().toLowerCase();
    if (!cleanUser) {
      setErrMsg('Ingresa tu usuario o código de administrador');
      return;
    }
    if (cleanUser !== ADMIN_USER && cleanUser !== 'tolomosa') {
      setErrMsg('Usuario administrador no reconocido');
      return;
    }
    if (!/^\d{4}$/.test(pin)) {
      setErrMsg('Ingresa el PIN numérico de 4 dígitos');
      return;
    }
    if (pin !== CODE) {
      setErrMsg('PIN incorrecto. Verifica los 4 dígitos e intenta de nuevo.');
      return;
    }
    setAuth({ ...auth, adm: true });
    go('adm');
    onClose();
    say('adm', 'Sesión de Administrador iniciada');
  };

  const keypadDigits = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

  return (
    <Modal bare title="Transporte Tolomosa — Acceso Personal" onClose={onClose}>
      {/* Cabecera de marca con botón claro de Volver al mapa */}
      <div className="flex items-center justify-between gap-2 rounded-t-[26px] bg-[#1E5B9A] px-4 py-3.5 text-white">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/15 text-white">
            {Ic.bus('h-6 w-6')}
          </span>
          <div className="min-w-0">
            <h2 className="text-[15.5px] font-extrabold leading-tight text-white">
              Transporte Tolomosa — Acceso Personal
            </h2>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Volver al mapa"
          className="flex shrink-0 items-center gap-1 rounded-xl bg-white/15 px-2.5 py-2 text-[12.5px] font-extrabold text-white transition hover:bg-white/25 active:scale-[0.98]"
        >
          {Ic.close('h-4 w-4 shrink-0')}
          <span>Volver al mapa</span>
        </button>
      </div>

      <div className="px-4 pt-4">
        {/* Selector de dos pestañas grandes */}
        <div role="tablist" aria-label="Tipo de acceso" className="grid grid-cols-2 gap-2.5">
          <button
            type="button"
            role="tab"
            aria-selected={roleTab === 'chof'}
            onClick={() => switchTab('chof')}
            className={`flex h-12 items-center justify-center gap-2 rounded-2xl px-3 text-[15px] font-extrabold transition ${
              roleTab === 'chof'
                ? 'bg-[#1E5B9A] text-white shadow-sm'
                : 'border border-[#d3e0f4] bg-[#e9f1fd] text-[#11203f]'
            }`}
          >
            {Ic.wheel('h-5 w-5 shrink-0')}
            <span>Soy Chofer</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={roleTab === 'adm'}
            onClick={() => switchTab('adm')}
            className={`flex h-12 items-center justify-center gap-2 rounded-2xl px-3 text-[15px] font-extrabold transition ${
              roleTab === 'adm'
                ? 'bg-[#1E5B9A] text-white shadow-sm'
                : 'border border-[#d3e0f4] bg-[#e9f1fd] text-[#11203f]'
            }`}
          >
            {Ic.gear('h-5 w-5 shrink-0')}
            <span>Administrador</span>
          </button>
        </div>

        {roleTab === 'chof' ? (
          <div className="mt-3.5">
            {auth.chof && selectedDriver && auth.driverId === selectedDriver.id && (
              <div className="mb-3 flex items-center justify-between gap-2 rounded-2xl border border-[#b7e4c7] bg-[#ecfdf3] px-3 py-2">
                <span className="truncate text-[13.5px] font-bold text-[#1a7a3a]">
                  Sesión activa: {selectedDriver.name}
                </span>
                <button
                  type="button"
                  onClick={() => resumeActiveSession('chof')}
                  className="shrink-0 rounded-xl bg-[#16a34a] px-3 py-1.5 text-[12.5px] font-extrabold text-white"
                >
                  Ir al panel
                </button>
              </div>
            )}

            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-[14px] font-bold text-[#11203f]">
                Selecciona tu nombre
              </span>
              <span className="text-[12.5px] font-semibold text-[#5f6f8a]">
                {drivers.length} registrados
              </span>
            </div>

            {drivers.length === 0 ? (
              <div className="rounded-2xl border border-[#d3e0f4] bg-[#f8fbff] p-3 text-center text-[14px] font-semibold text-[#5f6f8a]">
                No hay choferes registrados. Pide al Administrador que agregue uno.
              </div>
            ) : (
              <div
                role="listbox"
                aria-label="Choferes registrados"
                className="max-h-40 space-y-2 overflow-y-auto pr-0.5"
              >
                {drivers.map((d) => {
                  const selected = selectedDriver?.id === d.id;
                  return (
                    <button
                      key={d.id}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      onClick={() => {
                        setSelectedDriverId(d.id);
                        setErrMsg('');
                      }}
                      className={`flex w-full items-center gap-2.5 rounded-2xl px-3 py-2 text-left transition ${
                        selected
                          ? 'border-2 border-[#1E5B9A] bg-[#e9f1fd]'
                          : 'border border-[#d3e0f4] bg-white hover:bg-[#f7faff]'
                      }`}
                    >
                      <Avatar cap={d.cap} />
                      <div className="min-w-0 flex-1 leading-tight">
                        <div className="truncate text-[15px] font-extrabold text-[#11203f]">
                          {d.name}
                        </div>
                        <div className="truncate text-[13px] font-semibold text-[#5f6f8a]">
                          {d.micro !== null ? `Micro N° ${d.micro}` : 'Sin micro asignado'} · Ramal{' '}
                          {RAMALES[d.ramal]}
                        </div>
                      </div>
                      <Chip on={d.on}>{d.on ? 'Disponible' : 'Inactivo'}</Chip>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          <div className="mt-3.5">
            {auth.adm && (
              <div className="mb-3 flex items-center justify-between gap-2 rounded-2xl border border-[#b7e4c7] bg-[#ecfdf3] px-3 py-2">
                <span className="truncate text-[13.5px] font-bold text-[#1a7a3a]">
                  Sesión de Administrador activa
                </span>
                <button
                  type="button"
                  onClick={() => resumeActiveSession('adm')}
                  className="shrink-0 rounded-xl bg-[#16a34a] px-3 py-1.5 text-[12.5px] font-extrabold text-white"
                >
                  Ir al panel
                </button>
              </div>
            )}

            <Input
              label="Usuario o código administrador"
              placeholder="Ej. admin"
              autoComplete="username"
              value={adminUser}
              onChange={(e) => {
                setAdminUser(e.target.value);
                setErrMsg('');
              }}
            />
          </div>
        )}

        {/* Entrada de PIN numérico de 4 dígitos + teclado táctil grande */}
        <div className="mt-3 rounded-2xl border border-[#d3e0f4] bg-[#f8fbff] p-3">
          <div className="flex items-center justify-between">
            <label
              htmlFor="tolomosa-pin-input"
              className="text-[14px] font-bold text-[#11203f]"
            >
              PIN de 4 dígitos
            </label>
            <button
              type="button"
              onClick={() => setShowPin((v) => !v)}
              className="text-[12.5px] font-bold text-[#1E5B9A]"
            >
              {showPin ? 'Ocultar' : 'Mostrar PIN'}
            </button>
          </div>

          <input
            id="tolomosa-pin-input"
            type={showPin ? 'text' : 'password'}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={4}
            placeholder="••••"
            value={pin}
            onChange={(e) => {
              setPin(e.target.value.replace(/\D/g, '').slice(0, 4));
              setErrMsg('');
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                if (roleTab === 'chof') enterChofer();
                else enterAdmin();
              }
            }}
            className="mt-1.5 h-12 w-full rounded-xl border border-[#d3e0f4] bg-white px-3 text-center text-[24px] font-extrabold tracking-[0.55em] text-[#11203f] outline-none focus:border-[#1E5B9A] focus:ring-2 focus:ring-[#1E5B9A]/25"
          />

          <div className="mt-2.5 grid grid-cols-3 gap-2">
            {keypadDigits.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => pressDigit(d)}
                className="h-11 rounded-xl border border-[#d3e0f4] bg-white text-[20px] font-extrabold text-[#11203f] shadow-[0_1px_2px_rgba(17,32,63,0.05)] transition active:scale-[0.97] active:bg-[#e9f1fd]"
              >
                {d}
              </button>
            ))}
            <button
              type="button"
              onClick={clearPin}
              className="h-11 rounded-xl border border-[#d3e0f4] bg-[#eef3fb] text-[13px] font-extrabold text-[#5f6f8a] transition active:scale-[0.97]"
            >
              Limpiar
            </button>
            <button
              type="button"
              onClick={() => pressDigit('0')}
              className="h-11 rounded-xl border border-[#d3e0f4] bg-white text-[20px] font-extrabold text-[#11203f] shadow-[0_1px_2px_rgba(17,32,63,0.05)] transition active:scale-[0.97] active:bg-[#e9f1fd]"
            >
              0
            </button>
            <button
              type="button"
              onClick={backspacePin}
              aria-label="Borrar último dígito"
              className="h-11 rounded-xl border border-[#d3e0f4] bg-[#eef3fb] text-[18px] font-extrabold text-[#11203f] transition active:scale-[0.97]"
            >
              ⌫
            </button>
          </div>
        </div>

        {errMsg && (
          <p
            role="alert"
            className="mt-2.5 rounded-xl bg-[#fdecec] px-3 py-2 text-center text-[13.5px] font-bold text-[#c0332b]"
          >
            {errMsg}
          </p>
        )}

        <Btn
          tone="green"
          onClick={roleTab === 'chof' ? enterChofer : enterAdmin}
          className="mt-3 h-13 w-full rounded-2xl text-[17px] font-extrabold shadow-[0_4px_12px_rgba(22,163,74,.3)]"
        >
          {roleTab === 'chof' ? 'Ingresar como Chofer' : 'Ingresar como Administrador'}
        </Btn>

        {/* Botón discreto de autocompletado para pruebas */}
        <div className="mt-3 flex flex-col items-center gap-1 border-t border-[#e1e8f3] pt-2.5 text-center">
          <button
            type="button"
            onClick={fillDemoData}
            className="rounded-lg px-2.5 py-1 text-[13px] font-bold text-[#1E5B9A] transition hover:bg-[#e9f1fd]"
          >
            Autocompletar datos de prueba
          </button>
          <span className="text-[12px] font-semibold text-[#5f6f8a]">
            PIN de prueba: {CODE}
            {roleTab === 'adm' ? ` · Usuario: ${ADMIN_USER}` : ''}
          </span>
        </div>

        {!isInstalled && (isInstallable || isIOS) && (
          <div className="mt-2.5 border-t border-[#e1e8f3] pt-2.5">
            {isInstallable ? (
              <Btn
                tone="ghost"
                className="w-full text-[#1E5B9A]"
                onClick={async () => {
                  const ok = await install();
                  if (ok) say('pas', 'Aplicación instalada');
                }}
              >
                Instalar aplicación en el celular
              </Btn>
            ) : (
              <>
                <Btn
                  tone="ghost"
                  className="w-full text-[#1E5B9A]"
                  onClick={() => setIosGuide((v) => !v)}
                >
                  Instalar en iPhone / iPad
                </Btn>
                {iosGuide && (
                  <p className="mt-2 text-[13.5px] leading-snug text-[#5f6f8a]">
                    En Safari, toca el botón <strong>Compartir</strong> y elige{' '}
                    <strong>Agregar a inicio</strong>.
                  </p>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
};

type GpsTxStatus = 'idle' | 'sending' | 'paused' | 'offline';

const Chofer = ({
  drivers,
  meId,
  trip,
  now,
  setTrip,
  setJornadas,
  coopName,
  view,
  onLogout,
  toast,
  say,
}: {
  drivers: Driver[];
  meId: number;
  trip: ActiveTrip | null;
  now: number;
  setTrip: React.Dispatch<React.SetStateAction<ActiveTrip | null>>;
  setJornadas: React.Dispatch<React.SetStateAction<Jornada[]>>;
  coopName: string;
  view: RoleView;
  onLogout: () => void;
  toast: ToastState | null;
  say: (phone: RoleView, msg: string, tone?: 'ok' | 'err') => void;
}) => {
  const me = drivers.find((d) => d.id === meId) || drivers[0];
  const myTrip = trip && me && trip.driverId === me.id ? trip : null;
  const [ramal, setRamal] = useState(me?.ramal ?? 0);
  const [dir, setDir] = useState<Direction>('campesino');
  const [ask, setAsk] = useState<'start' | 'end' | null>(null);
  const isOnline = useOnlineStatus();
  const [gpsStatus, setGpsStatus] = useState<GpsTxStatus>('idle');
  const [queuedCount, setQueuedCount] = useState<number>(() => readGpsQueue().length);

  const latestGpsRef = useRef<{ lat: number; lng: number } | null>(null);
  const lastSentRef = useRef<LiveLocation | null>(null);
  const rRef = useRef(ramal);
  const dRef = useRef(dir);
  const isOnlineRef = useRef(isOnline);
  const tripRef = useRef(myTrip);

  // Cerrar confirmaciones si se cambia de vista
  useEffect(() => {
    if (view !== 'chof') setAsk(null);
  }, [view]);

  // Sincronizar ramal habitual del chofer cuando no hay viaje activo
  useEffect(() => {
    if (!myTrip && me) {
      setRamal(me.ramal);
    }
  }, [me, myTrip]);

  const r = myTrip ? myTrip.ramal : ramal;
  const d = myTrip ? myTrip.dir : dir;

  rRef.current = r;
  dRef.current = d;
  isOnlineRef.current = isOnline;
  tripRef.current = myTrip;

  const transmitLocation = useCallback(
    (driverId: number, enServicio: boolean, forceSend = false) => {
      const coords = latestGpsRef.current ?? { lat: DEFAULT_POS[0], lng: DEFAULT_POS[1] };
      const packet = buildCompactLocation(
        coords.lat,
        coords.lng,
        enServicio,
        rRef.current,
        dRef.current
      );
      const prev = lastSentRef.current;
      const movedMeters = prev
        ? haversineMeters(prev.lat, prev.lng, packet.lat, packet.lng)
        : Infinity;
      const metadataChanged =
        !prev ||
        prev.enServicio !== packet.enServicio ||
        prev.ramal !== packet.ramal ||
        prev.direccion !== packet.direccion;

      // Filtro de quietud: si el micro no se movió >= 15 m y no cambió estado/ruta, omitir escritura
      if (!forceSend && !metadataChanged && movedMeters < 15) {
        setGpsStatus(isOnlineRef.current ? 'paused' : 'offline');
        return;
      }

      lastSentRef.current = packet;

      if (isOnlineRef.current) {
        setGpsStatus('sending');
        void syncUbicacionViva(driverId, packet);
      } else {
        setGpsStatus('offline');
        const nextQueue = [...readGpsQueue(), { ...packet, driverId }];
        writeGpsQueue(nextQueue);
        setQueuedCount(nextQueue.length);
      }
    },
    []
  );

  // Captura GPS con watchPosition (alta precisión) y envío estricto a Firestore cada 10s
  useEffect(() => {
    const activeDriverId = myTrip?.driverId;
    if (!activeDriverId) {
      lastSentRef.current = null;
      setGpsStatus(isOnlineRef.current ? 'idle' : 'offline');
      return;
    }

    let watchId: number | null = null;
    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          latestGpsRef.current = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
          };
        },
        () => {
          if (!latestGpsRef.current) {
            latestGpsRef.current = { lat: DEFAULT_POS[0], lng: DEFAULT_POS[1] };
          }
        },
        { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
      );
    } else if (!latestGpsRef.current) {
      latestGpsRef.current = { lat: DEFAULT_POS[0], lng: DEFAULT_POS[1] };
    }

    const initialTimer = window.setTimeout(() => {
      transmitLocation(activeDriverId, true, true);
    }, 600);

    const strict10sTimer = window.setInterval(() => {
      transmitLocation(activeDriverId, true, false);
    }, 10000);

    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(strict10sTimer);
      if (watchId !== null && typeof navigator !== 'undefined' && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchId);
      }
    };
  }, [myTrip?.driverId, transmitLocation]);

  // Al recuperar señal, envía inmediatamente la posición actual a ubicaciones_vivas y vacía la cola
  useEffect(() => {
    if (!isOnline) {
      setGpsStatus('offline');
      return;
    }

    const pending = readGpsQueue();
    if (pending.length > 0) {
      const lastQueued = pending[pending.length - 1];
      const currentTrip = tripRef.current;
      const targetDriverId = currentTrip?.driverId ?? lastQueued.driverId;
      const coords = latestGpsRef.current ?? { lat: lastQueued.lat, lng: lastQueued.lng };
      const payload = buildCompactLocation(
        coords.lat,
        coords.lng,
        !!currentTrip,
        currentTrip ? rRef.current : lastQueued.ramal,
        currentTrip ? dRef.current : lastQueued.direccion
      );

      lastSentRef.current = payload;
      void syncUbicacionViva(targetDriverId, payload);
      writeGpsQueue([]);
      setQueuedCount(0);
      setGpsStatus(currentTrip ? 'sending' : 'idle');
      if (view === 'chof') {
        say('chof', 'Señal recuperada · Ubicación sincronizada');
      }
    } else if (tripRef.current) {
      setGpsStatus('sending');
    } else {
      setGpsStatus('idle');
    }
  }, [isOnline, say, view]);

  const handleRamalChange = (nextRamal: number) => {
    setRamal(nextRamal);
    rRef.current = nextRamal;
    if (myTrip) {
      setTrip((prev) => (prev ? { ...prev, ramal: nextRamal } : null));
      transmitLocation(myTrip.driverId, true, true);
      say('chof', `Ramal actualizado: Ramal ${RAMALES[nextRamal]}`);
    }
  };

  const handleDirChange = (nextDir: Direction) => {
    setDir(nextDir);
    dRef.current = nextDir;
    if (myTrip) {
      setTrip((prev) => (prev ? { ...prev, dir: nextDir } : null));
      transmitLocation(myTrip.driverId, true, true);
      say('chof', `Dirección actualizada: ${dirTxt(nextDir)}`);
    }
  };

  const start = () => {
    if (!me) return say('chof', 'No hay choferes registrados', 'err');
    if (!me.on)
      return say(
        'chof',
        `${me.name} figura como No disponible. Pide al administrador que te habilite`,
        'err'
      );
    if (me.micro === null) return say('chof', 'Aún no tienes un micro asignado', 'err');
    setAsk('start');
  };

  const confirmStart = () => {
    if (!me || me.micro === null) return;
    setTrip({
      driverId: me.id,
      name: me.name,
      micro: me.micro,
      ramal,
      dir,
      start: Date.now(),
    });
    setAsk(null);
    say('chof', `Viaje iniciado · Micro N° ${me.micro}`);
  };

  const confirmEnd = () => {
    if (!myTrip) return;
    const end = Date.now();
    const newJornada: Jornada = {
      k: end,
      name: myTrip.name,
      micro: myTrip.micro,
      ramal: myTrip.ramal,
      dir: myTrip.dir,
      start: myTrip.start,
      end,
    };
    transmitLocation(myTrip.driverId, false, true);
    setJornadas((j) => [newJornada, ...j]);
    void syncJornadaDoc(newJornada);
    setTrip(null);
    setAsk(null);
    say('chof', 'Viaje terminado y registrado');
  };

  const logout = () =>
    myTrip ? say('chof', 'Termina el viaje antes de cerrar sesión', 'err') : onLogout();

  const seg = (k: Direction) =>
    `flex h-[62px] min-w-0 items-center justify-center gap-2 rounded-xl px-2 text-left text-[14.5px] font-bold leading-tight sm:text-[16px] ${
      d === k
        ? 'bg-[#0b4bbf] text-white'
        : 'border border-[#dfe4ec] bg-[#e8ebf0] text-[#11203f]'
    }`;

  const txIndicator = !isOnline ? (
    <div className="mt-2.5 flex items-center justify-center gap-2 rounded-xl border border-[#fdba74] bg-[#fff7ed] px-3 py-2 text-[13px] font-extrabold text-[#c2410c]">
      <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-[#ea580c]" />
      <span>
        Sin internet — guardando ruta en el teléfono
        {queuedCount > 0 ? ` (${queuedCount})` : ''}
      </span>
    </div>
  ) : myTrip ? (
    <div className="mt-2.5 flex items-center justify-center gap-2 rounded-xl border border-[#d3e0f4] bg-[#f4f8ff] px-3 py-1.5 text-[12.5px] font-bold text-[#11203f]">
      <span
        className={`h-2 w-2 shrink-0 rounded-full ${
          gpsStatus === 'paused' ? 'bg-[#d97706]' : 'bg-[#16a34a] animate-pulse'
        }`}
      />
      <span>
        {gpsStatus === 'paused'
          ? 'En espera en parada (< 15 m · ahorrando datos)'
          : 'GPS activo · Enviando cada 10s'}
      </span>
    </div>
  ) : null;

  return (
    <AppShell
      toast={toast}
      overlay={
        ask === 'start' && me ? (
          <Confirm
            title="¿Comenzar viaje?"
            text={`Micro N° ${me.micro} · Ramal ${RAMALES[ramal]} · ${dirTxt(dir)}. Los pasajeros verán tu micro como en servicio.`}
            ok="Comenzar"
            tone="green"
            onOk={confirmStart}
            onClose={() => setAsk(null)}
          />
        ) : ask === 'end' && myTrip ? (
          <Confirm
            title="¿Terminar viaje?"
            text={`Llevas ${mins(myTrip.start, now)} min en ruta. El viaje quedará registrado en las jornadas.`}
            ok="Terminar"
            tone="red"
            onOk={confirmEnd}
            onClose={() => setAsk(null)}
          />
        ) : null
      }
    >
      <div className="flex min-h-dvh flex-col bg-[#0b4bbf] md:bg-[#eaf1fd]">
        <Header
          icon={Ic.wheel('h-14 w-14')}
          title="Chofer"
          subtitle={
            me
              ? `${me.name} · ${me.micro !== null ? `Micro N° ${me.micro}` : 'Sin micro asignado'}`
              : coopName
          }
          big
          action={
            <button
              type="button"
              aria-label="Cerrar sesión"
              onClick={logout}
              className="shrink-0 text-white"
            >
              {Ic.logout('h-9 w-9')}
            </button>
          }
        />
        <Hero className="h-52 w-full shrink-0 md:hidden" />

        <div className="flex flex-1 flex-col md:mx-auto md:grid md:w-full md:max-w-6xl md:grid-cols-12 md:items-stretch md:gap-6 md:px-6 md:py-6">
          {/* Columna izquierda en tablet/PC: controles de ramal, dirección e iniciar/terminar viaje */}
          <section className="-mt-3 flex flex-1 flex-col rounded-t-[26px] bg-white px-4 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-4 md:col-span-6 md:mt-0 md:justify-center md:rounded-[24px] md:border md:border-[#e1e8f3] md:p-6 md:shadow-sm">
            <h2 className="flex items-center justify-center gap-2 text-[27px] font-extrabold text-[#11203f]">
              <span className="shrink-0 text-[#0b4bbf]">{Ic.road('h-10 w-10')}</span>
              {myTrip ? 'Viaje en curso' : 'Iniciar Viaje'}
            </h2>
            <span className="mb-1.5 mt-3 block text-[17px] font-bold text-[#11203f]">Ramal</span>
            <Field
              icon={Ic.pin('h-6 w-6 text-[#0b4bbf]')}
              tint="bg-[#e4edfb]"
              value={`Ramal ${RAMALES[r]}`}
              right={Ic.chevron('h-6 w-6 text-[#11203f]')}
            >
              <Pick
                label="Ramal"
                value={r}
                onChange={(e) => handleRamalChange(Number(e.target.value))}
              >
                {RAMALES.map((n, i) => (
                  <option key={n} value={i}>
                    Ramal {n}
                  </option>
                ))}
              </Pick>
            </Field>
            <span className="mb-1.5 mt-3 block text-[17px] font-bold text-[#11203f]">
              Dirección
            </span>
            <div className="grid grid-cols-2 gap-1.5 md:gap-3">
              <button
                type="button"
                aria-pressed={d === 'campesino'}
                onClick={() => handleDirChange('campesino')}
                className={seg('campesino')}
              >
                {Ic.up('h-7 w-7 shrink-0')}
                <span>
                  Hacia el
                  <br />
                  Campesino
                </span>
              </button>
              <button
                type="button"
                aria-pressed={d === 'ramales'}
                onClick={() => handleDirChange('ramales')}
                className={seg('ramales')}
              >
                {Ic.down('h-7 w-7 shrink-0')}
                <span>
                  Hacia los
                  <br />
                  Ramales
                </span>
              </button>
            </div>
            {myTrip ? (
              <button
                type="button"
                onClick={() => setAsk('end')}
                className="mt-4 flex h-[62px] w-full items-center justify-center gap-2 rounded-2xl bg-[#c0332b] text-[22px] font-extrabold text-white shadow-[0_5px_12px_rgba(192,51,43,.35)] sm:text-[24px]"
              >
                <span className="h-5 w-5 shrink-0 rounded-[4px] bg-white" />
                Terminar Viaje
              </button>
            ) : (
              <button
                type="button"
                onClick={start}
                className="mt-4 flex h-[62px] w-full items-center justify-center gap-2 rounded-2xl bg-[#16a34a] text-[22px] font-extrabold text-white shadow-[0_5px_12px_rgba(22,163,74,.35)] sm:text-[24px]"
              >
                {Ic.play('h-9 w-9 shrink-0')}
                Comenzar Viaje
              </button>
            )}
            {txIndicator}
            <div className="mt-3 flex items-center gap-3 rounded-[14px] border border-[#c3d6f3] bg-[#dde9fb] px-3.5 py-3 md:hidden">
              <span className="shrink-0 text-[#1b6fe8]">{Ic.check('h-9 w-9')}</span>
              <p className="text-[16px] font-semibold leading-tight text-[#11203f]">
                {myTrip
                  ? `Micro N° ${myTrip.micro} en servicio · activo ${mmss(now - myTrip.start)}`
                  : me && !me.on
                    ? `${me.name} · Acceso inactivo. Pide al Administrador que active tu cuenta.`
                    : `${me?.name ?? 'Chofer'} · ${
                        me?.micro !== null && me?.micro !== undefined
                          ? `Micro N° ${me.micro} listo`
                          : 'Sin micro asignado'
                      }. Tu viaje quedará registrado para el control del servicio.`}
              </p>
            </div>
            <Ridge className="mx-auto mt-auto h-14 w-64 pb-2 md:hidden" />
          </section>

          {/* Columna derecha en tablet/PC: ruta visual y tarjeta de estado En servicio */}
          <section className="hidden md:col-span-6 md:flex md:flex-col md:justify-between md:gap-4 md:rounded-[24px] md:border md:border-[#d3e0f4] md:bg-white md:p-6 md:shadow-sm">
            <div className="overflow-hidden rounded-[18px] border border-[#d3e0f4] bg-[#0b4bbf]">
              <Hero className="h-56 w-full lg:h-64" />
              <div className="flex flex-wrap items-center justify-between gap-2 bg-white px-4 py-3">
                <div className="min-w-0">
                  <div className="text-[17px] font-extrabold text-[#11203f]">
                    {me?.micro !== null && me?.micro !== undefined
                      ? `Micro N° ${me.micro}`
                      : 'Sin micro asignado'}{' '}
                    · Ramal {RAMALES[r]}
                  </div>
                  <div className="truncate text-[14px] font-semibold text-[#5f6f8a]">
                    {me?.name ?? coopName} · {dirTxt(d)}
                  </div>
                </div>
                <Chip on={!!myTrip || !!me?.on}>
                  {myTrip ? 'En servicio' : me?.on ? 'En espera' : 'Inactivo'}
                </Chip>
              </div>
            </div>

            <div className="flex items-center gap-3 rounded-[16px] border border-[#c3d6f3] bg-[#dde9fb] px-4 py-3.5">
              <span className="shrink-0 text-[#1b6fe8]">{Ic.check('h-9 w-9')}</span>
              <div className="min-w-0">
                <div className="text-[15px] font-extrabold text-[#0b4bbf]">
                  {myTrip ? 'En servicio' : me && !me.on ? 'Acceso inactivo' : 'Estado de ruta'}
                </div>
                <p className="text-[15.5px] font-semibold leading-tight text-[#11203f]">
                  {myTrip
                    ? `Micro N° ${myTrip.micro} en servicio · activo ${mmss(now - myTrip.start)}`
                    : me && !me.on
                      ? `${me.name} · El Administrador desactivó tu acceso temporalmente.`
                      : `${me?.name ?? 'Chofer'} · ${
                          me?.micro !== null && me?.micro !== undefined
                            ? `Micro N° ${me.micro} listo`
                            : 'Sin micro asignado'
                        }. Tu viaje quedará registrado para el control del servicio.`}
                </p>
              </div>
            </div>

            <Ridge className="mx-auto h-12 w-60" />
          </section>
        </div>
      </div>
    </AppShell>
  );
};

const DriverForm = ({
  init,
  drivers,
  vehiculos,
  onSave,
  onDelete,
  onCancel,
}: {
  init?: Driver;
  drivers: Driver[];
  vehiculos: Vehiculo[];
  onSave: (v: {
    name: string;
    phone: string;
    pin: string;
    micro: number | null;
    ramal: number;
  }) => void;
  onDelete: (d: Driver) => void;
  onCancel: () => void;
}) => {
  const [f, setF] = useState({
    name: init?.name ?? '',
    phone: init?.phone ?? '',
    pin: init ? driverPin(init) : CODE,
    micro: init?.micro !== null && init?.micro !== undefined ? String(init.micro) : '',
    ramal: init?.ramal ?? 0,
  });
  const [showPin, setShowPin] = useState(false);
  const [t, setT] = useState<{ name?: number; phone?: number; micro?: number; pin?: number }>({});
  const [del, setDel] = useState(false);

  const err = {
    name: vNombre(f.name),
    phone: vTel(f.phone),
    micro: vMicro(String(f.micro), drivers, init?.id),
    pin: vPin(f.pin),
  };

  const save = () => {
    setT({ name: 1, phone: 1, micro: 1, pin: 1 });
    if (err.name || err.phone || err.micro || err.pin) return;
    onSave({
      name: f.name.trim().replace(/\s+/g, ' '),
      phone: f.phone.trim(),
      pin: f.pin,
      micro: String(f.micro) === '' ? null : Number(f.micro),
      ramal: Number(f.ramal),
    });
  };

  return (
    <>
      <Input
        autoFocus
        label="Nombre completo"
        placeholder="Ej. Juan Pérez"
        value={f.name}
        onChange={(e) => setF({ ...f, name: e.target.value })}
        onBlur={() => setT({ ...t, name: 1 })}
        error={t.name ? err.name : ''}
      />
      <Input
        label="Teléfono"
        placeholder="Ej. 71823410"
        inputMode="numeric"
        maxLength={8}
        value={f.phone}
        onChange={(e) => setF({ ...f, phone: e.target.value.replace(/\D/g, '') })}
        onBlur={() => setT({ ...t, phone: 1 })}
        error={t.phone ? err.phone : ''}
      />
      <label className="mb-3 block">
        <span className="text-[14px] font-semibold text-[#5f6f8a]">
          Vehículo / Micro asignado (flota del panel Vehículos)
        </span>
        <select
          aria-label="Vehículo o Micro asignado"
          value={f.micro}
          onChange={(e) => {
            setF({ ...f, micro: e.target.value });
            setT({ ...t, micro: 1 });
          }}
          className={`mt-1 h-12 w-full rounded-[12px] border bg-white px-3 text-[16px] font-semibold text-[#11203f] outline-none focus:ring-2 focus:ring-[#0b5bdb] ${
            t.micro && err.micro ? 'border-[#c0332b]' : 'border-[#d3e0f4]'
          }`}
        >
          <option value="">Sin micro asignado (Reemplazo)</option>
          {(vehiculos.length > 0
            ? Array.from(
                new Set([
                  ...vehiculos.map((v) => v.numero),
                  ...(init?.micro !== null && init?.micro !== undefined ? [init.micro] : []),
                ])
              ).sort((a, b) => a - b)
            : FLEET_MICROS
          ).map((num) => {
            const owner = drivers.find((d) => d.micro === num && d.id !== init?.id);
            return (
              <option key={num} value={String(num)} disabled={!!owner}>
                Micro N° {num}
                {owner
                  ? ` — Ocupado (${owner.name})`
                  : init?.micro === num
                    ? ' — Actual'
                    : ' — Disponible'}
              </option>
            );
          })}
        </select>
        {t.micro && err.micro && (
          <span role="alert" className="mt-1 block text-[13px] font-semibold text-[#c0332b]">
            {err.micro}
          </span>
        )}
      </label>
      <label className="mb-3 block">
        <span className="text-[14px] font-semibold text-[#5f6f8a]">Ramal habitual</span>
        <select
          value={f.ramal}
          onChange={(e) => setF({ ...f, ramal: Number(e.target.value) })}
          className="mt-1 h-12 w-full rounded-[12px] border border-[#d3e0f4] bg-white px-3 text-[16px] font-semibold text-[#11203f] outline-none focus:ring-2 focus:ring-[#0b5bdb]"
        >
          {RAMALES.map((n, i) => (
            <option key={n} value={i}>
              Ramal {n}
            </option>
          ))}
        </select>
      </label>
      <label className="mb-4 block">
        <span className="flex items-center justify-between text-[14px] font-semibold text-[#5f6f8a]">
          <span>PIN de acceso (4 dígitos)</span>
          <button
            type="button"
            onClick={() => setShowPin((v) => !v)}
            className="text-[13px] font-bold text-[#0b4bbf]"
          >
            {showPin ? 'Ocultar' : 'Mostrar'}
          </button>
        </span>
        <input
          type={showPin ? 'text' : 'password'}
          inputMode="numeric"
          maxLength={4}
          placeholder="••••"
          value={f.pin}
          onChange={(e) => setF({ ...f, pin: e.target.value.replace(/\D/g, '').slice(0, 4) })}
          onBlur={() => setT({ ...t, pin: 1 })}
          aria-invalid={!!(t.pin && err.pin)}
          className={`mt-1 h-12 w-full rounded-[12px] border bg-white px-3 text-[18px] font-extrabold tracking-[0.35em] text-[#11203f] outline-none focus:ring-2 focus:ring-[#0b5bdb] ${
            t.pin && err.pin ? 'border-[#c0332b]' : 'border-[#d3e0f4]'
          }`}
        />
        {t.pin && err.pin && (
          <span role="alert" className="mt-1 block text-[13px] font-semibold text-[#c0332b]">
            {err.pin}
          </span>
        )}
      </label>
      <div className="grid grid-cols-2 gap-2">
        <Btn tone="ghost" onClick={onCancel}>
          Cancelar
        </Btn>
        <Btn tone="green" onClick={save}>
          {init ? 'Guardar cambios' : 'Registrar Chofer'}
        </Btn>
      </div>
      {init &&
        (del ? (
          <div className="mt-3 rounded-[14px] bg-[#fdeceb] p-3">
            <p className="mb-2 text-[14px] font-semibold text-[#c0332b]">
              ¿Eliminar a {init.name}? No se puede deshacer.
            </p>
            <Btn tone="red" className="w-full" onClick={() => onDelete(init)}>
              Sí, eliminar
            </Btn>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setDel(true)}
            className="mt-3 w-full text-[15px] font-bold text-[#c0332b]"
          >
            Eliminar chofer
          </button>
        ))}
    </>
  );
};

type AdminTab = 'inicio' | 'choferes' | 'vehiculos' | 'reportes' | 'jornadas' | 'config';
type AdminModalState =
  | { t: 'driver'; d?: Driver }
  | { t: 'logout' }
  | { t: 'clear' }
  | { t: 'reset' }
  | null;

const Admin = ({
  drivers,
  setDrivers,
  vehiculos,
  setVehiculos,
  trip,
  setTrip,
  jornadas,
  setJornadas,
  cfg,
  setCfg,
  view,
  onSeedDemoData,
  resetAll,
  onLogout,
  toast,
  say,
}: {
  drivers: Driver[];
  setDrivers: React.Dispatch<React.SetStateAction<Driver[]>>;
  vehiculos: Vehiculo[];
  setVehiculos: React.Dispatch<React.SetStateAction<Vehiculo[]>>;
  trip: ActiveTrip | null;
  setTrip: React.Dispatch<React.SetStateAction<ActiveTrip | null>>;
  jornadas: Jornada[];
  setJornadas: React.Dispatch<React.SetStateAction<Jornada[]>>;
  cfg: AppConfig;
  setCfg: React.Dispatch<React.SetStateAction<AppConfig>>;
  view: RoleView;
  onSeedDemoData: () => Promise<void>;
  resetAll: () => void;
  onLogout: () => void;
  toast: ToastState | null;
  say: (phone: RoleView, msg: string, tone?: 'ok' | 'err') => void;
}) => {
  const [tab, setTab] = useState<AdminTab>('inicio');
  const [modal, setModal] = useState<AdminModalState>(null);
  const [driverQuery, setDriverQuery] = useState('');
  const [revealedPins, setRevealedPins] = useState<Record<number, boolean>>({});
  const [draft, setDraft] = useState(cfg.coop);
  const [tc, setTc] = useState(false);
  const [seeding, setSeeding] = useState(false);

  // Cerrar modales si cambia de vista y mantener sincronizado draft con cfg.coop
  useEffect(() => {
    if (view !== 'adm') setModal(null);
  }, [view]);

  useEffect(() => {
    setDraft(cfg.coop);
  }, [cfg.coop]);

  const close = () => setModal(null);

  const tiles: Array<[keyof typeof Ic, string, string, AdminTab]> = [
    ['people', 'Choferes', 'Gestionar personal', 'choferes'],
    ['bus', 'Vehículos', 'Control de micros', 'vehiculos'],
    ['bars', 'Estadísticas', 'Ver reportes', 'reportes'],
    ['cal', 'Jornadas', 'Historial de viajes', 'jornadas'],
  ];

  const isDriverOnTrip = useCallback(
    (d: Driver) =>
      !!trip && (trip.driverId === d.id || (d.micro !== null && trip.micro === d.micro)),
    [trip]
  );

  const toggle = (d: Driver) => {
    if (!d.on && d.micro === null)
      return say('adm', `Asigna un micro a ${d.name} antes de habilitarlo`, 'err');
    if (d.on && isDriverOnTrip(d))
      return say('adm', `${d.name} tiene un viaje en curso`, 'err');
    const updated: Driver = { ...d, on: !d.on };
    setDrivers((ds) => ds.map((x) => (x.id === d.id ? updated : x)));
    void syncChoferDoc(updated);
    say('adm', `${d.name} ahora está ${d.on ? 'Inactivo' : 'Disponible'}`);
  };

  const saveDriver =
    (init?: Driver) =>
    (v: { name: string; phone: string; pin: string; micro: number | null; ramal: number }) => {
      if (init) {
        if (isDriverOnTrip(init) && v.micro === null) {
          return say('adm', 'No puedes quitar el micro a un chofer con viaje en curso', 'err');
        }
        const updated: Driver = {
          ...init,
          ...v,
          on: v.micro !== null ? init.on : false,
        };
        setDrivers((ds) => ds.map((x) => (x.id === init.id ? updated : x)));
        void syncChoferDoc(updated);
        if (v.micro !== null && !vehiculos.some((veh) => veh.numero === v.micro)) {
          const newVeh: Vehiculo = { id: v.micro, numero: v.micro, ramal: v.ramal, activo: true };
          setVehiculos((vs) => [...vs, newVeh]);
          void syncVehiculoDoc(newVeh);
        }
        if (isDriverOnTrip(init) && v.micro !== null) {
          const nextMicro = v.micro;
          setTrip((prev) =>
            prev ? { ...prev, name: v.name, micro: nextMicro, ramal: v.ramal } : null
          );
        }
        say('adm', 'Chofer actualizado');
      } else {
        const created: Driver = {
          id: Math.max(0, ...drivers.map((x) => x.id)) + 1,
          ...v,
          on: v.micro !== null,
          cap: '#1f5fd0',
        };
        setDrivers((ds) => [...ds, created]);
        void syncChoferDoc(created);
        if (v.micro !== null && !vehiculos.some((veh) => veh.numero === v.micro)) {
          const newVeh: Vehiculo = { id: v.micro, numero: v.micro, ramal: v.ramal, activo: true };
          setVehiculos((vs) => [...vs, newVeh]);
          void syncVehiculoDoc(newVeh);
        }
        say('adm', `Chofer registrado: ${v.name}${v.micro !== null ? ` · Micro N° ${v.micro}` : ''}`);
      }
      close();
    };

  const removeDriver = (d: Driver) => {
    if (isDriverOnTrip(d))
      return say('adm', 'No puedes eliminar a un chofer con viaje en curso', 'err');
    setDrivers((ds) => ds.filter((x) => x.id !== d.id));
    void deleteChoferDoc(d.id);
    close();
    say('adm', `${d.name} eliminado`);
  };

  const saveCfg = () => {
    setTc(true);
    const trimmed = draft.trim();
    if (trimmed.length < 3 || trimmed.length > 80) return;
    const nextCfg = { ...cfg, coop: trimmed };
    setCfg(nextCfg);
    say('adm', 'Cambios guardados');
  };

  const nav = (
    k: AdminTab,
    label: string,
    icon: (c: string) => React.ReactNode,
    tabs: AdminTab[]
  ) => (
    <button
      type="button"
      aria-current={tabs.includes(tab) ? 'page' : undefined}
      onClick={() => setTab(k)}
      className={`flex flex-col items-center md:w-full md:flex-row md:gap-3 md:rounded-[14px] md:px-3.5 md:py-2.5 md:text-[15px] ${
        tabs.includes(tab)
          ? 'text-[#0b4bbf] md:bg-[#e9f1fd]'
          : 'md:text-[#5f6f8a] md:hover:bg-[#f5f8fd]'
      }`}
    >
      {icon('h-7 w-7 shrink-0 md:h-6 md:w-6')}
      <span className="truncate">{label}</span>
    </button>
  );

  const back = (title: string) => (
    <div className="flex shrink-0 items-center gap-2">
      <button
        type="button"
        aria-label="Volver al inicio"
        onClick={() => setTab('inicio')}
        className="grid h-9 w-9 place-items-center rounded-full bg-white text-[#0b4bbf] [&>svg]:rotate-90"
      >
        {Ic.chevron('h-6 w-6')}
      </button>
      <h2 className="text-[20px] font-extrabold text-[#11203f]">{title}</h2>
    </div>
  );

  const card = 'rounded-[18px] border border-[#e1e8f3] bg-white p-3';

  const total = useMemo(
    () => jornadas.reduce((s, j) => s + mins(j.start, j.end), 0),
    [jornadas]
  );

  const stats = useMemo(
    () => [
      [`${drivers.filter((x) => x.on).length}/${drivers.length}`, 'Choferes disponibles'],
      [String(jornadas.length), 'Viajes realizados'],
      [`${total} min`, 'Tiempo en ruta'],
      [trip ? '1' : '0', 'Micros en ruta ahora'],
    ],
    [drivers, jornadas.length, total, trip]
  );

  const filteredDrivers = useMemo(() => {
    const norm = (s: string) =>
      s
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
    const qNorm = norm(driverQuery.trim());
    if (!qNorm) return drivers;
    return drivers.filter((d) => {
      const microTxt = d.micro !== null ? `micro ${d.micro} ${d.micro}` : 'reemplazo sin micro';
      return (
        norm(d.name).includes(qNorm) ||
        norm(microTxt).includes(qNorm) ||
        (d.phone || '').includes(qNorm)
      );
    });
  }, [driverQuery, drivers]);

  const activeDriversCount = useMemo(() => drivers.filter((d) => d.on).length, [drivers]);
  const inactiveDriversCount = drivers.length - activeDriversCount;

  const fleetList = useMemo(() => {
    const byNum = new Map<number, { vehiculo?: Vehiculo; driver?: Driver }>();
    vehiculos.forEach((v) => byNum.set(v.numero, { vehiculo: v }));
    drivers.forEach((d) => {
      if (d.micro !== null) {
        const prev = byNum.get(d.micro) ?? {};
        byNum.set(d.micro, { ...prev, driver: d });
      }
    });
    return Array.from(byNum.entries())
      .sort(([a], [b]) => a - b)
      .map(([numero, info]) => ({
        numero,
        ramal: info.driver?.ramal ?? info.vehiculo?.ramal ?? 0,
        activo: info.vehiculo?.activo ?? true,
        driver: info.driver,
      }));
  }, [drivers, vehiculos]);

  const modalEl = !modal ? null : modal.t === 'driver' ? (
    <Modal title={modal.d ? 'Editar chofer' : 'Nuevo chofer'} onClose={close}>
      <DriverForm
        init={modal.d}
        drivers={drivers}
        vehiculos={vehiculos}
        onSave={saveDriver(modal.d)}
        onDelete={removeDriver}
        onCancel={close}
      />
    </Modal>
  ) : modal.t === 'logout' ? (
    <Confirm
      title="¿Cerrar sesión?"
      text="Tendrás que ingresar de nuevo para administrar."
      ok="Cerrar sesión"
      onOk={() => {
        close();
        setTab('inicio');
        onLogout();
      }}
      onClose={close}
    />
  ) : modal.t === 'clear' ? (
    <Confirm
      title="¿Borrar historial?"
      text="Se eliminarán todas las jornadas registradas."
      ok="Borrar"
      tone="red"
      onOk={() => {
        jornadas.forEach((j) => void deleteJornadaDoc(j.k));
        setJornadas([]);
        close();
        say('adm', 'Historial borrado');
      }}
      onClose={close}
    />
  ) : (
    <Confirm
      title="¿Restablecer datos?"
      text="Los choferes, jornadas y ajustes vuelven a los valores iniciales."
      ok="Restablecer"
      tone="red"
      onOk={() => {
        resetAll();
        setDraft(CFG0.coop);
        close();
        say('adm', 'Datos restablecidos');
      }}
      onClose={close}
    />
  );

  return (
    <AppShell toast={toast} lift={84} overlay={modalEl}>
      <div className="flex min-h-dvh flex-col bg-[#eef3fc] md:bg-[#eaf1fd]">
        <Header
          tone="bg-[#5b3db0]"
          icon={Ic.gear('h-14 w-14')}
          title="Administrador"
          subtitle={cfg.coop}
          action={
            <button
              type="button"
              aria-label="Cerrar sesión"
              onClick={() => setModal({ t: 'logout' })}
              className="shrink-0 text-white"
            >
              {Ic.logout('h-9 w-9')}
            </button>
          }
        />

        <div className="flex min-h-0 flex-1 flex-col md:mx-auto md:w-full md:max-w-6xl md:flex-row md:items-start md:gap-5 md:px-4 md:py-6 lg:gap-6 lg:px-6">
          <div
            className={`-mt-1 flex min-h-0 flex-1 flex-col gap-2.5 rounded-t-[22px] bg-[#eef3fc] px-3 pb-2.5 pt-3 md:order-2 md:mt-0 md:min-w-0 md:gap-4 md:rounded-none md:bg-transparent md:p-0 ${
              tab === 'inicio' ? '' : 'overflow-y-auto md:overflow-visible'
            }`}
          >
            {tab === 'inicio' && (
              <>
                <div className="grid shrink-0 grid-cols-2 gap-2.5 md:grid-cols-4 md:gap-3 lg:gap-4">
                  {tiles.map(([k, t, s, go]) => (
                    <button
                      type="button"
                      key={t}
                      onClick={() => setTab(go)}
                      className="min-w-0 rounded-[18px] border border-[#e1e8f3] bg-white px-2 py-2 text-center md:px-2 md:py-3 md:shadow-sm md:transition-colors md:hover:border-[#b9cdf0] lg:px-3 lg:py-3.5"
                    >
                      <span className="mx-auto block w-fit text-[#0b4bbf]">
                        {Ic[k]('h-9 w-9 [--win:#fff]')}
                      </span>
                      <div className="mt-1 truncate text-[17px] font-bold leading-tight text-[#11203f] md:text-[15.5px] lg:text-[18px]">
                        {t}
                      </div>
                      <div className="truncate text-[13.5px] leading-tight text-[#5f6f8a] md:text-[12.5px] lg:text-[13.5px]">
                        {s}
                      </div>
                    </button>
                  ))}
                </div>
                <div className="flex min-h-0 flex-1 flex-col rounded-[18px] border border-[#e1e8f3] bg-white px-3 pb-3 pt-3 md:p-4 md:shadow-sm lg:p-5">
                  <div className="mb-1 flex flex-wrap items-center justify-between gap-2 md:mb-3">
                    <h2 className="flex items-center gap-2 text-[19px] font-bold text-[#11203f]">
                      <span className="shrink-0 text-[#0b4bbf]">{Ic.people('h-8 w-8')}</span>
                      Choferes Registrados
                    </h2>
                    <button
                      type="button"
                      onClick={() => setTab('choferes')}
                      className="text-[13.5px] font-bold text-[#0b4bbf] hover:underline"
                    >
                      Gestionar todos ({drivers.length})
                    </button>
                  </div>
                  <ul className="min-h-0 flex-1 overflow-y-auto md:grid md:grid-cols-2 md:gap-3 md:overflow-visible">
                    {drivers.length === 0 && (
                      <li className="py-4 text-center text-[15px] text-[#5f6f8a] md:col-span-2">
                        Aún no hay choferes. Agrega el primero.
                      </li>
                    )}
                    {drivers.map((d) => (
                      <li
                        key={d.id}
                        className="flex items-center gap-2.5 border-t border-[#edf1f7] py-1.5 first:border-0 md:flex-col md:items-stretch md:gap-2.5 md:rounded-[16px] md:border md:border-[#e1e8f3] md:bg-[#fafcff] md:p-3 lg:flex-row lg:items-center lg:px-3.5 lg:py-2.5"
                      >
                        <button
                          type="button"
                          onClick={() => setModal({ t: 'driver', d })}
                          aria-label={`Editar a ${d.name}`}
                          className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                        >
                          <Avatar cap={d.cap} />
                          <span className="min-w-0 flex-1 leading-tight">
                            <span className="block truncate text-[17px] font-bold text-[#11203f]">
                              {d.name}
                            </span>
                            <span className="block truncate text-[14px] text-[#5f6f8a]">
                              {d.micro ? `Micro N° ${d.micro}` : 'Reemplazo'}
                            </span>
                          </span>
                        </button>
                        <div className="flex shrink-0 items-center justify-between gap-2 md:justify-end">
                          <span
                            className={`shrink-0 whitespace-nowrap rounded-full px-3 py-[3px] text-[13px] font-bold ${
                              d.on ? 'bg-[#22a447] text-white' : 'bg-[#e3e7ee] text-[#7a8699]'
                            }`}
                          >
                            {d.on ? 'Disponible' : 'No disponible'}
                          </span>
                          <Toggle
                            on={d.on}
                            label={`Disponibilidad de ${d.name}`}
                            onClick={() => toggle(d)}
                          />
                        </div>
                      </li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    onClick={() => setModal({ t: 'driver' })}
                    className="mt-2 flex h-11 w-full shrink-0 items-center justify-center gap-2 rounded-xl bg-[#0b4bbf] text-[17px] font-bold text-white md:mt-4 md:w-auto md:self-end md:px-6"
                  >
                    {Ic.plus('h-6 w-6')}Agregar Chofer
                  </button>
                </div>
              </>
            )}
            {tab === 'choferes' && (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  {back('Choferes')}
                  <button
                    type="button"
                    onClick={() => setModal({ t: 'driver' })}
                    className="flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-[14px] bg-[#16a34a] px-4 text-[15px] font-extrabold text-white shadow-[0_3px_10px_rgba(22,163,74,.28)] transition active:scale-[0.98]"
                  >
                    {Ic.plus('h-5 w-5')}
                    <span>Nuevo Chofer</span>
                  </button>
                </div>

                <div className={`${card} space-y-3 md:p-5 md:shadow-sm`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-[#e9f1fd] px-3 py-1 text-[13px] font-extrabold text-[#0b4bbf]">
                      Total: {drivers.length}
                    </span>
                    <span className="rounded-full bg-[#c9f2d3] px-3 py-1 text-[13px] font-extrabold text-[#1a7a3a]">
                      {activeDriversCount} activos
                    </span>
                    <span className="rounded-full bg-[#e3e7ee] px-3 py-1 text-[13px] font-extrabold text-[#5f6f8a]">
                      {inactiveDriversCount} inactivos
                    </span>
                    {trip && (
                      <span className="rounded-full bg-[#0b4bbf] px-3 py-1 text-[13px] font-extrabold text-white">
                        Micro N° {trip.micro} en servicio
                      </span>
                    )}
                  </div>

                  <div className="relative flex items-center rounded-[14px] border border-[#d3e0f4] bg-[#fafcff]">
                    <span className="pl-3 text-[#0b4bbf]">{Ic.search('h-5 w-5')}</span>
                    <input
                      type="search"
                      aria-label="Buscar chofer por nombre o número de micro"
                      placeholder="Buscar por nombre o N° de micro..."
                      value={driverQuery}
                      onChange={(e) => setDriverQuery(e.target.value)}
                      className="h-11 w-full bg-transparent px-2.5 text-[15.5px] font-semibold text-[#11203f] outline-none placeholder:text-[#7a8699]"
                    />
                    {driverQuery && (
                      <button
                        type="button"
                        aria-label="Limpiar búsqueda"
                        onClick={() => setDriverQuery('')}
                        className="pr-3 text-[#5f6f8a]"
                      >
                        {Ic.close('h-4 w-4')}
                      </button>
                    )}
                  </div>
                </div>

                <div className={`${card} md:p-5 md:shadow-sm`}>
                  {filteredDrivers.length === 0 ? (
                    <div className="py-5 text-center">
                      <p className="text-[15px] font-semibold text-[#5f6f8a]">
                        {drivers.length === 0
                          ? 'Aún no hay choferes registrados.'
                          : 'No se encontraron choferes con esa búsqueda.'}
                      </p>
                      {driverQuery && (
                        <button
                          type="button"
                          onClick={() => setDriverQuery('')}
                          className="mt-2 text-[14px] font-bold text-[#0b4bbf]"
                        >
                          Limpiar filtro
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-2.5 md:grid md:grid-cols-2 md:gap-3 md:space-y-0">
                      {filteredDrivers.map((d) => {
                        const onTrip = isDriverOnTrip(d);
                        const pinVisible = !!revealedPins[d.id];
                        const statusLabel = onTrip
                          ? 'En servicio'
                          : d.on
                            ? 'Disponible'
                            : 'Inactivo';
                        const statusStyle = onTrip
                          ? 'bg-[#0b4bbf] text-white'
                          : d.on
                            ? 'bg-[#c9f2d3] text-[#1a7a3a]'
                            : 'bg-[#e3e7ee] text-[#5f6f8a]';

                        return (
                          <article
                            key={d.id}
                            className="rounded-[14px] border border-[#e1e8f3] bg-[#fafcff] p-3.5"
                          >
                            <div className="flex items-start justify-between gap-2.5">
                              <div className="flex min-w-0 flex-1 items-center gap-2.5">
                                <Avatar cap={d.cap} />
                                <div className="min-w-0 flex-1 leading-tight">
                                  <h3 className="truncate text-[17px] font-extrabold text-[#11203f]">
                                    {d.name}
                                  </h3>
                                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[13.5px] font-semibold text-[#5f6f8a]">
                                    <span className="inline-flex items-center gap-1">
                                      {Ic.phone('h-3.5 w-3.5 text-[#0b4bbf]')}
                                      {d.phone || 'Sin teléfono'}
                                    </span>
                                    <span>·</span>
                                    <span className="font-bold text-[#11203f]">
                                      {d.micro !== null ? `Micro N° ${d.micro}` : 'Sin micro'}
                                    </span>
                                  </div>
                                  <div className="mt-0.5 text-[12.5px] font-semibold text-[#5f6f8a]">
                                    Ramal {RAMALES[d.ramal]}
                                  </div>
                                </div>
                              </div>

                              <div className="flex shrink-0 flex-col items-end gap-1.5">
                                <span
                                  className={`whitespace-nowrap rounded-full px-3 py-[3px] text-[12.5px] font-extrabold ${statusStyle}`}
                                >
                                  {statusLabel}
                                </span>
                                <Toggle
                                  on={d.on}
                                  label={`Activar o desactivar acceso de ${d.name}`}
                                  onClick={() => toggle(d)}
                                />
                              </div>
                            </div>

                            <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 border-t border-[#e1e8f3] pt-2.5">
                              <div className="flex items-center gap-2">
                                <span className="text-[13px] font-bold text-[#5f6f8a]">
                                  PIN:{' '}
                                  <span className="font-extrabold tracking-widest text-[#11203f]">
                                    {pinVisible ? driverPin(d) : '••••'}
                                  </span>
                                </span>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setRevealedPins((prev) => ({
                                      ...prev,
                                      [d.id]: !prev[d.id],
                                    }))
                                  }
                                  className="inline-flex items-center gap-1 rounded-lg bg-white px-2 py-1 text-[12.5px] font-bold text-[#0b4bbf] ring-1 ring-[#d3e0f4]"
                                >
                                  {pinVisible ? Ic.eyeOff('h-3.5 w-3.5') : Ic.eye('h-3.5 w-3.5')}
                                  <span>{pinVisible ? 'Ocultar' : 'Ver'}</span>
                                </button>
                              </div>

                              <button
                                type="button"
                                onClick={() => setModal({ t: 'driver', d })}
                                className="inline-flex items-center gap-1 rounded-[10px] bg-[#e9f1fd] px-3 py-1.5 text-[13px] font-extrabold text-[#0b4bbf] hover:bg-[#dce8fb]"
                              >
                                {Ic.edit('h-3.5 w-3.5')}
                                <span>Editar</span>
                              </button>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  )}
                </div>
              </>
            )}
            {tab === 'vehiculos' && (
              <>
                {back('Vehículos')}
                <div className={`${card} md:p-5 md:shadow-sm`}>
                  {fleetList.length === 0 ? (
                    <p className="py-4 text-center text-[15px] text-[#5f6f8a]">
                      No hay micros registrados todavía en Firestore. Puedes crear los datos iniciales
                      desde <span className="font-bold text-[#11203f]">Configuración</span>.
                    </p>
                  ) : (
                    <div className="md:grid md:grid-cols-2 md:gap-3">
                      {fleetList.map((item) => {
                        const onRoute = item.driver ? isDriverOnTrip(item.driver) : false;
                        const chipOn = item.driver ? onRoute || item.driver.on : item.activo;
                        const statusText = onRoute
                          ? 'En ruta'
                          : item.driver
                            ? item.driver.on
                              ? 'Libre'
                              : 'Parado'
                            : item.activo
                              ? 'Disponible'
                              : 'Inactivo';
                        return (
                          <div
                            key={item.numero}
                            className="flex items-center gap-3 border-t border-[#edf1f7] py-2 first:border-0 md:rounded-[14px] md:border md:border-[#e1e8f3] md:bg-[#fafcff] md:px-3.5 md:py-2.5"
                          >
                            <span className="shrink-0 text-[#0b4bbf]">
                              {Ic.bus('h-9 w-9 [--win:#fff]')}
                            </span>
                            <span className="min-w-0 flex-1 leading-tight">
                              <span className="block text-[17px] font-bold">
                                Micro N° {item.numero}
                              </span>
                              <span className="block truncate text-[14px] text-[#5f6f8a]">
                                {item.driver ? item.driver.name : 'Sin chofer asignado'} · Ramal{' '}
                                {RAMALES[item.ramal]}
                              </span>
                            </span>
                            <Chip on={chipOn}>{statusText}</Chip>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  <p className="pt-2 text-[13.5px] text-[#5f6f8a] md:pt-3">
                    {fleetList.length} micros registrados en flota ·{' '}
                    {fleetList.filter((item) => !!item.driver).length} con chofer asignado.
                  </p>
                </div>
              </>
            )}
            {tab === 'reportes' && (
              <>
                {back('Reportes')}
                <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4 md:gap-4">
                  {stats.map(([n, l]) => (
                    <div key={l} className={`${card} text-center md:p-5 md:shadow-sm`}>
                      <div className="text-[26px] font-extrabold text-[#0b4bbf]">{n}</div>
                      <div className="text-[13.5px] leading-tight text-[#5f6f8a]">{l}</div>
                    </div>
                  ))}
                </div>
                <Btn onClick={() => setTab('jornadas')} className="shrink-0 md:self-start md:px-6">
                  Ver historial de jornadas
                </Btn>
              </>
            )}
            {tab === 'jornadas' && (
              <>
                {back('Jornadas')}
                <div className={`${card} md:p-5 md:shadow-sm`}>
                  {jornadas.length === 0 && (
                    <p className="py-3 text-center text-[15px] text-[#5f6f8a]">
                      Todavía no hay viajes. Inicia uno desde la pantalla Chofer.
                    </p>
                  )}
                  <div className="md:grid md:grid-cols-2 md:gap-3">
                    {jornadas.map((j) => (
                      <div
                        key={j.k}
                        className="border-t border-[#edf1f7] py-2 first:border-0 md:rounded-[14px] md:border md:border-[#e1e8f3] md:bg-[#fafcff] md:px-3.5 md:py-2.5"
                      >
                        <div className="truncate text-[16px] font-bold">
                          {j.name} · Micro N° {j.micro}
                        </div>
                        <div className="text-[13.5px] text-[#5f6f8a]">
                          Ramal {RAMALES[j.ramal]} · {dirTxt(j.dir)} · {hm(j.start)}–{hm(j.end)} (
                          {mins(j.start, j.end)} min)
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                {jornadas.length > 0 && (
                  <Btn
                    tone="ghost"
                    className="shrink-0 md:self-start md:px-6"
                    onClick={() => setModal({ t: 'clear' })}
                  >
                    Borrar historial
                  </Btn>
                )}
              </>
            )}
            {tab === 'config' && (
              <>
                {back('Configuración')}
                <div className={`${card} md:max-w-xl md:p-5 md:shadow-sm`}>
                  <Input
                    label="Nombre de la cooperativa"
                    maxLength={80}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onBlur={() => setTc(true)}
                    error={
                      tc && draft.trim().length < 3
                        ? 'Mínimo 3 caracteres'
                        : tc && draft.trim().length > 80
                          ? 'Máximo 80 caracteres'
                          : ''
                    }
                  />
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-[16px] font-semibold">Notificaciones</span>
                    <Toggle
                      on={cfg.notif}
                      label="Notificaciones"
                      onClick={() => {
                        const nextCfg = { ...cfg, notif: !cfg.notif };
                        setCfg(nextCfg);
                        say(
                          'adm',
                          cfg.notif ? 'Notificaciones desactivadas' : 'Notificaciones activadas'
                        );
                      }}
                    />
                  </div>
                  <Btn className="w-full" onClick={saveCfg}>
                    Guardar cambios
                  </Btn>
                </div>
                {(drivers.length === 0 || vehiculos.length === 0) && (
                  <div className={`${card} md:max-w-xl md:p-5 md:shadow-sm`}>
                    <p className="mb-3 text-[14.5px] font-semibold text-[#5f6f8a]">
                      {drivers.length === 0 && vehiculos.length === 0
                        ? 'Las colecciones choferes y vehiculos están vacías en Firestore.'
                        : 'Faltan registros iniciales en choferes o vehiculos en Firestore.'}
                    </p>
                    <Btn
                      tone="green"
                      disabled={seeding}
                      className="w-full"
                      onClick={async () => {
                        setSeeding(true);
                        try {
                          await onSeedDemoData();
                        } catch {
                          say(
                            'adm',
                            'No se pudo escribir en Firestore. Revisa las reglas de seguridad.',
                            'err'
                          );
                        } finally {
                          setSeeding(false);
                        }
                      }}
                    >
                      {seeding ? 'Creando datos...' : 'Inicializar datos de prueba'}
                    </Btn>
                  </div>
                )}
                <Btn
                  tone="ghostRed"
                  className="shrink-0 md:max-w-xl"
                  onClick={() => setModal({ t: 'reset' })}
                >
                  Restablecer datos
                </Btn>
              </>
            )}
          </div>

          <nav className="sticky bottom-0 grid shrink-0 grid-cols-3 border-t border-[#e1e8f3] bg-white pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 text-center text-[13.5px] font-semibold text-[#5f6f8a] md:static md:order-1 md:flex md:w-44 md:shrink-0 md:flex-col md:gap-1.5 md:rounded-[22px] md:border md:border-[#e1e8f3] md:p-2.5 md:text-left md:shadow-sm lg:w-56 lg:p-3">
            {nav('inicio', 'Inicio', Ic.home, ['inicio', 'choferes', 'vehiculos', 'jornadas'])}
            {nav('reportes', 'Reportes', Ic.bars, ['reportes'])}
            {nav('config', 'Configuración', Ic.gear, ['config'])}
          </nav>
        </div>
      </div>
    </AppShell>
  );
};

export default function App() {
  const [drivers, setDrivers] = useSyncedShared<Driver[]>('tt_drivers', []);
  const [vehiculos, setVehiculos] = useSyncedShared<Vehiculo[]>('tt_vehiculos', []);
  const [trip, setTrip] = useSyncedShared<ActiveTrip | null>('tt_trip', null);
  const [jornadas, setJornadas] = useSyncedShared<Jornada[]>('tt_jornadas', []);
  const [cfg, setCfg] = useSyncedShared<AppConfig>('tt_cfg', CFG0);
  const [liveLocations, setLiveLocations] = useState<Record<number, LiveLocation>>(() =>
    readCachedLiveLocations()
  );

  const [view, setView] = useLocalStored<RoleView>('tt_view', 'pas');
  const [auth, setAuth] = useLocalStored<AuthState>('tt_auth', {});

  const [toast, setToast] = useState<ToastState | null>(null);
  const now = useNow();

  useEffect(() => {
    if (drivers.some((d) => !d.pin || d.phone === undefined)) {
      setDrivers((ds) =>
        ds.map((d) => {
          const seed = SEED.find((s) => s.id === d.id);
          return {
            ...d,
            phone: d.phone ?? seed?.phone ?? '',
            pin: d.pin && /^\d{4}$/.test(d.pin) ? d.pin : CODE,
          };
        })
      );
    }
  }, [drivers, setDrivers]);

  // Suscripción en tiempo real a Firestore (con caché persistente offline)
  useEffect(() => {
    const unsubLocations = onSnapshot(
      query(collection(db, 'ubicaciones_vivas'), limit(200)),
      (snap) => {
        const next: Record<number, LiveLocation> = {};
        snap.forEach((docSnap) => {
          const idNum = Number(docSnap.id);
          if (Number.isFinite(idNum)) {
            next[idNum] = docSnap.data() as LiveLocation;
          }
        });
        setLiveLocations(next);
        writeCachedLiveLocations(next);
      },
      (error) => {
        if (isPermissionError(error)) {
          handleFirestoreError(error, OperationType.LIST, 'ubicaciones_vivas');
        }
      }
    );

    const unsubDrivers = onSnapshot(
      query(collection(db, 'choferes'), limit(200)),
      (snap) => {
        if (snap.empty) {
          if (!snap.metadata.fromCache) {
            setDrivers([]);
          }
          return;
        }
        const loaded: Driver[] = [];
        snap.forEach((docSnap) => {
          loaded.push(docSnap.data() as Driver);
        });
        loaded.sort((a, b) => a.id - b.id);
        setDrivers(loaded);
      },
      (error) => {
        if (isPermissionError(error)) {
          handleFirestoreError(error, OperationType.LIST, 'choferes');
        }
      }
    );

    const unsubVehiculos = onSnapshot(
      query(collection(db, 'vehiculos'), limit(200)),
      (snap) => {
        if (snap.empty) {
          if (!snap.metadata.fromCache) {
            setVehiculos([]);
          }
          return;
        }
        const loaded: Vehiculo[] = [];
        snap.forEach((docSnap) => {
          loaded.push(docSnap.data() as Vehiculo);
        });
        loaded.sort((a, b) => a.numero - b.numero);
        setVehiculos(loaded);
      },
      (error) => {
        if (isPermissionError(error)) {
          handleFirestoreError(error, OperationType.LIST, 'vehiculos');
        }
      }
    );

    const unsubJornadas = onSnapshot(
      query(collection(db, 'jornadas'), limit(500)),
      (snap) => {
        if (snap.empty && snap.metadata.fromCache) return;
        const loaded: Jornada[] = [];
        snap.forEach((docSnap) => {
          loaded.push(docSnap.data() as Jornada);
        });
        loaded.sort((a, b) => b.k - a.k);
        setJornadas(loaded);
      },
      (error) => {
        if (isPermissionError(error)) {
          handleFirestoreError(error, OperationType.LIST, 'jornadas');
        }
      }
    );

    return () => {
      unsubLocations();
      unsubDrivers();
      unsubVehiculos();
      unsubJornadas();
    };
  }, [setDrivers, setJornadas, setVehiculos]);

  const say = useCallback((phone: RoleView, msg: string, tone: 'ok' | 'err' = 'ok') => {
    setToast({ phone, msg, tone, k: Date.now() });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(id);
  }, [toast]);

  useEffect(() => {
    if ((view === 'chof' && !auth.chof) || (view === 'adm' && !auth.adm)) {
      setView('pas');
    }
  }, [auth.adm, auth.chof, setView, view]);

  const seedDemoData = useCallback(async () => {
    await Promise.all([
      ...SEED_VEHICLES.map((v) => syncVehiculoDoc(v)),
      ...SEED.map((d) => syncChoferDoc(d)),
    ]);
    setVehiculos(SEED_VEHICLES);
    setDrivers(SEED);
    say('adm', '3 micros y 3 choferes creados en Firestore');
  }, [say, setDrivers, setVehiculos]);

  const resetAll = useCallback(() => {
    drivers.forEach((d) => {
      if (!SEED.some((s) => s.id === d.id)) {
        void deleteChoferDoc(d.id);
      }
    });
    vehiculos.forEach((v) => {
      if (!SEED_VEHICLES.some((s) => s.id === v.id)) {
        void deleteVehiculoDoc(v.id);
      }
    });
    SEED_VEHICLES.forEach((v) => void syncVehiculoDoc(v));
    SEED.forEach((d) => void syncChoferDoc(d));
    jornadas.forEach((j) => void deleteJornadaDoc(j.k));
    writeGpsQueue([]);
    setVehiculos(SEED_VEHICLES);
    setDrivers(SEED);
    setTrip(null);
    setJornadas([]);
    setCfg(CFG0);
    setAuth({});
    setView('pas');
  }, [drivers, jornadas, setAuth, setCfg, setDrivers, setJornadas, setTrip, setVehiculos, setView, vehiculos]);

  const logout = useCallback(() => {
    setAuth({});
    setView('pas');
    say('pas', 'Sesión cerrada');
  }, [say, setAuth, setView]);

  const tf = (p: RoleView) => (toast && toast.phone === p ? toast : null);
  const show = (k: RoleView) => (view === k ? '' : 'hidden');
  const activeDriverId = auth.driverId ?? drivers[0]?.id ?? 1;

  return (
    <main className="min-h-dvh w-full bg-[#eaf1fd] font-['Nunito_Sans',system-ui,sans-serif]">
      <div className={show('pas')}>
        <Pasajero
          drivers={drivers}
          trip={trip}
          liveLocations={liveLocations}
          now={now}
          auth={auth}
          setAuth={setAuth}
          view={view}
          go={setView}
          toast={tf('pas')}
          say={say}
        />
      </div>
      <div className={show('chof')}>
        <Chofer
          drivers={drivers}
          meId={activeDriverId}
          trip={trip}
          now={now}
          setTrip={setTrip}
          setJornadas={setJornadas}
          coopName={cfg.coop}
          view={view}
          onLogout={logout}
          toast={tf('chof')}
          say={say}
        />
      </div>
      <div className={show('adm')}>
        <Admin
          drivers={drivers}
          setDrivers={setDrivers}
          vehiculos={vehiculos}
          setVehiculos={setVehiculos}
          trip={trip}
          setTrip={setTrip}
          jornadas={jornadas}
          setJornadas={setJornadas}
          cfg={cfg}
          setCfg={setCfg}
          view={view}
          onSeedDemoData={seedDemoData}
          resetAll={resetAll}
          onLogout={logout}
          toast={tf('adm')}
          say={say}
        />
      </div>
    </main>
  );
}
