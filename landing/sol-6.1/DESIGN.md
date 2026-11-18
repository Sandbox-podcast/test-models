---
name: COSMOS by SANDBOX
description: Smoked glass suspended in a dark celestial studio.
colors:
  obsidian: "#050509"
  ink: "#edebf3"
  muted: "#a6a4b8"
  display-silver: "#dedce8"
  body-silver: "#c4bed2"
  navigation-silver: "#bbb8cb"
  night-blue: "#20326455"
  spectral-violet: "#72449e48"
  cold-silver: "#8b9dbd36"
  action-silver: "#e9e5ee"
  action-ink: "#17141d"
  action-ghost: "#0c0b1566"
  action-ghost-ink: "#d2c8df"
  focus: "#dfd2ff"
typography:
  display: {fontFamily: "Cormorant Garamond, Baskerville Old Face, Georgia, serif", fontSize: "clamp(110px,23vw,410px)", fontWeight: 300, lineHeight: 0.8, letterSpacing: "0.065em"}
  headline: {fontFamily: "Cormorant Garamond, Baskerville Old Face, Georgia, serif", fontSize: "clamp(56px,6.5vw,104px)", fontWeight: 300, lineHeight: 0.94, letterSpacing: "-0.035em"}
  body: {fontFamily: "Inter, sans-serif", fontSize: "13px", fontWeight: 400, lineHeight: 1.9, letterSpacing: "0.015em"}
  label: {fontFamily: "Inter, sans-serif", fontSize: "10px", letterSpacing: "0.07em"}
  navigation: {fontFamily: "Inter, sans-serif", fontSize: "11px", letterSpacing: "0.08em"}
rounded: {square: "0px", circle: "50%"}
spacing:
  page: "clamp(24px,4.4vw,88px)"
  section: "clamp(48px,11vw,210px)"
  mobile-page: "24px"
  mobile-section: "32px"
  copy-gap: "34px"
  rule-gap: "30px"
components:
  button-primary: {backgroundColor: "{colors.action-silver}", textColor: "{colors.action-ink}", typography: "{typography.label}", rounded: "{rounded.square}", padding: "0 25px"}
  button-secondary: {backgroundColor: "{colors.action-ghost}", textColor: "{colors.action-ghost-ink}", typography: "{typography.label}", rounded: "{rounded.square}", padding: "0 25px"}
  navigation-link: {textColor: "{colors.navigation-silver}", typography: "{typography.navigation}", padding: "12px 0"}
  motion-toggle: {textColor: "{colors.navigation-silver}", padding: "12px 0"}
---

# Design System: COSMOS by SANDBOX

## Overview

**Creative North Star: "A celestial studio"**

The pinned visual world joins luxury perfume photography with cosmic space: black, blue, violet and cold silver; smoked glass, restrained text and thin luminous orbits. The product remains the visual anchor while oversized serif lettering and quiet interface marks establish scale.

**Key Characteristics:**
- Smoked glass and studio reflections.
- Large, light serif type with compact sans-serif controls.
- Sparse copy, generous space and continuous atmospheric depth.

This reference records the source implementation. Browser rendering, screenshots, device layouts and contrast have not been visually validated.

## Colors

Primary atmosphere uses Night Blue; Spectral Violet is the secondary light, and Cold Silver provides the third illumination. These translucent colors accumulate over Obsidian rather than becoming solid interface fills. Silver text carries the hierarchy; pale Action Silver identifies the opening action. Focus is a separate light outline.

## Typography

Cormorant Garamond is requested remotely, with Baskerville Old Face and Georgia fallbacks. Inter regular and medium are locally embedded. Display type is light and monumental; headings tighten spacing and permit italic emphasis. Interface labels stay small and tracked. Body copy occupies short lines rather than dense paragraphs. On phones, headings use a fixed size (56px), body copy reduces (11px), and the hero title remains viewport-scaled (23vw).

## Layout

The atmosphere and product stage are fixed; the document scrolls natively above and around them. Desktop copy alternates sides with a maximum width (480px); right-side panels use a narrow proportional column (35%). Hero, revelation, universe and finale sections use viewport-based heights with explicit minimums. Revelation copy is sticky for one viewport. The opening title sits behind the bottle; supporting text sits above the visual stage.

At the compact breakpoint (1000px), horizontal padding and copy narrow. At the mobile breakpoint (650px), copy moves below the bottle, columns become full width, header navigation simplifies, and visual particle counts fall. At the wide breakpoint (1800px), the hero receives a height cap (1200px). A fixed chapter rail and one-pixel progress line preserve orientation.

## Elevation & Depth

Depth comes from translucent atmospheres, a vignette, real 3D glass transmission and studio reflections. Thin additive orbits and particles sit at different depths. Interface surfaces remain flat; shadows belong to the glass fallback, glowing chapter indicator and light markers. A scroll-linked radial mask creates a brief luminous wipe between tableaux. Keep the fallback visible until the 3D scene is ready and after WebGL context loss.

## Shapes

Actions have square corners and fine borders. Circular dots, circular universe marks and elliptical light orbits contrast with the bevelled rectangular bottle. Small linear rules divide copy without enclosing it in cards. Do not infer a rounded card system from the product's curved glass.

## Components

- **Primary action:** pale rectangular anchor, arrow, minimum height (50px); a white fill sweeps from the left on hover and the arrow moves downward.
- **Secondary action:** translucent dark anchor with a thin silver border, minimum height (45px); hover lifts the arrow and brightens the surface and border. Both actions use a mobile minimum (48px).
- **Navigation:** thin tracked links gain an underline on hover; keyboard focus uses the shared outline with offset (7px). The first header link is hidden on phones.
- **Motion control:** a compact orbit icon with a slash in its pressed state. System preference supplies the default; the manual choice persists. Reduced motion removes continuous animation, transitions, pointer response and the light wipe while retaining scroll-driven poses and readable copy.
- **Chapter rail:** six anchor dots; the active location gains a pale center and soft halo. Its name appears on hover on larger screens; the active anchor receives `aria-current`.
- **Universe mark and product stage:** a small tinted ring introduces each light world; the decorative canvas supplies alternating full and macro product poses and the final particle halo. Accessible product text stays in HTML.
- **Interactive 3D bottle:** sculpted shoulders, a bevelled glass shell, liquid meniscus, dip tube and metallic cap remain visible from a three-quarter initial view. A transparent button tracks the projected bottle bounds. Horizontal dragging rotates the model through 360°; vertical touch scrolling remains native. Arrow keys rotate by 15°, activation by 45°, and Home or Escape reset the manual orientation. Explicit manipulation remains available in reduced motion. Copy is interactive above the product; empty section space does not intercept gestures. The control and its hint are unavailable until WebGL is ready.

## Do's and Don'ts

- Do keep the black, blue, violet and cold-silver world.
- Do reserve the largest serif type for product identity and short headlines.
- Do preserve native scrolling, anchor navigation and the reduced-motion control.
- Do keep the conceptual bottle and all product wording honest about available evidence.
- Don't add unsupported scent notes, concentration, pricing or purchase destinations.
- Don't turn atmospheric light colors into large opaque interface panels.
- Don't introduce dense cards or heavy rounded controls into this sparse composition.
