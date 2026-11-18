const paths:Record<string,string>={
 home:'<path d="M3 4h7v7H3zm11 0h7v7h-7zM3 15h7v6H3zm11 0h7v6h-7z"/>',
 book:'<path d="M4 4h6l2 2 2-2h6v15h-6l-2 2-2-2H4zM12 6v15"/>',
 map:'<path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3zM9 3v15m6-12v15"/>',
 volume:'<path d="M3 9h4l5-4v14l-5-4H3zM15 8q4 4 0 8m3-11q7 7 0 14"/>',
 mute:'<path d="M3 9h4l5-4v14l-5-4H3zM16 9l6 6m0-6-6 6"/>',
 user:'<circle cx="12" cy="8" r="3"/><path d="M5 20v-2a7 7 0 0 1 14 0v2"/>',
 play:'<path d="m7 4 13 8-13 8z" fill="currentColor" stroke="none"/>',
 keyboard:'<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M5 9h2m2 0h2m2 0h2m2 0h2M5 12h2m2 0h2m2 0h2m2 0h2m-11 3h9"/>',
 pin:'<path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0z"/><circle cx="12" cy="10" r="2"/>',
 aim:'<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/><path d="M12 1v5m0 12v5M1 12h5m12 0h5"/>',
 arrow:'<path d="M4 12h15m-6-6 6 6-6 6"/>',diagonal:'<path d="M5 19 19 5M6 5h13v13"/>',
 chip:'<rect x="6" y="6" width="12" height="12" rx="1"/><path d="M9 2v4m6-4v4M9 18v4m6-4v4M2 9h4m-4 6h4m12-6h4m-4 6h4"/><path d="M10 10h4v4h-4z"/>',
 clock:'<circle cx="12" cy="12" r="8"/><path d="M12 7v5l3 2"/>',cross:'<path d="m5 5 14 14M19 5 5 19"/>',
 signal:'<path d="M4 19v-3m5 3v-7m5 7V8m5 11V4"/>',save:'<path d="M4 4h13l3 3v13H4zM8 4v6h8V4M8 20v-6h8v6"/>',
 flag:'<path d="M5 21V3m0 1h14l-3 4 3 4H5"/>',lock:'<rect x="5" y="10" width="14" height="10" rx="1"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
 bolt:'<path d="m13 2-9 12h7l-1 8 10-13h-7z"/>',car:'<path d="m4 11 2-6h12l2 6v8h-3v-2H7v2H4zm0 1h16M6 14h3m6 0h3"/>',
 pause:'<path d="M7 4h3v16H7zm7 0h3v16h-3z"/>',layers:'<path d="m2 8 10-5 10 5-10 5zm1 5 9 5 9-5m-18 5 9 5 9-5"/>'
}
export const icon=(name:string,size=18)=>`<svg aria-hidden="true" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linejoin="round" stroke-linecap="round">${paths[name]||''}</svg>`
export const logo='<svg aria-hidden="true" viewBox="0 0 43 32" width="40" height="30"><path fill="currentColor" d="M0 29 15 3h8L8 29zm12 0L27 3h7L19 29zm11 0L35 8l5 8-7 13z"/></svg>'
