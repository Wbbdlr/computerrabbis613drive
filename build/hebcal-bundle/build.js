#!/usr/bin/env node
// Rebuilds usb-root/Zmanim/hebcal.bundle.min.js.
//
//   cd build/hebcal-bundle
//   npm install
//   npm run build
//
// This directory is a build-time-only tool (gitignored node_modules); only
// the resulting hebcal.bundle.min.js is committed to the platform itself.
const esbuild = require('esbuild');
const path = require('path');

const OUT = path.join(__dirname, '..', '..', 'usb-root', 'Zmanim', 'hebcal.bundle.min.js');

esbuild.buildSync({
  entryPoints: [path.join(__dirname, 'entry.js')],
  bundle: true,
  minify: true,
  format: 'iife',
  platform: 'browser',
  outfile: OUT,
});

console.log('wrote', OUT);
