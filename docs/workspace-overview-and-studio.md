# Workspace overview and Door Visualizer

The owner dashboard groups revenue, pipeline, operations, phone and integration
metrics into Important Data. Work Overview contains upcoming jobs, recent
payments, follow-ups and recent activity. SMS Failures and High Priority Tasks
are removed from the dashboard. Needs Attention is a dedicated sidebar page
immediately below Settings.

Banking, Social Media and Office are grouped at the bottom of the sidebar and in
the Business Workspace launcher. Banking opens existing payment, invoice,
expense and payroll tools; it does not claim a connected bank account. Office
links to existing team, catalog, stock, vendor and settings tools. Social Media
retains the existing connection-pending screen.

The visualizer separates Designer and Saved designs. New work follows door size,
home photo, door selection/positioning, then review. Catalog browsing groups
matching design families while exact model searches and insulation selection
retain the underlying product IDs. Favorites remain available in one tab;
custom reference-image uploads stay in the separate owner catalog screen.

Saved designs retain a storage asset ID for the home photo. Existing legacy
references are normalized and signed again when loaded. Resuming and saving
updates the same design record instead of creating another copy. Rendering
remains a manual layout preview, with the existing manufacturer/illustration
labels preserved.

Home Image offers a phone camera input, a photo upload, and the eight existing
EZfix style illustrations. References reuse bundled files, preserve their source
when saved, and create a local multi-opening board when more than one door is
configured. The reference illustration is not assigned a manufacturer identity.

Design Door follows the Amarr interaction order: collection, door design, color,
window placement/design, glass, construction and decorative hardware. A single
option group opens at a time beside the preview. Construction selects the
existing product ID. The included public Amarr catalog snapshot covers nine
collections; unsupported choices are not borrowed from other collections.
`scripts/import-amarr-config-options.py` refreshes this snapshot and its local
thumbnails. Release builds use only bundled data, without a remote dependency.

The existing panel/window images drive the layout preview. Finish colors are
approximate; glass and hardware selections are retained in the specification
without replacing those details in the preview image. This is not the Amarr
rendering engine and does not reproduce its Mosaic/Color Zone configurators.
Review shows Before and After side by side, the full selection, PDF export,
printing, sharing, saving and the existing estimate workflow. The same selections
and existing product ID carry through to an estimate.

Verified with an isolated Chromium fixture at desktop and 390px widths: dashboard
groups, sidebar destinations, guided photo/model flow, saved-design separation,
asset URL renewal, updating the existing design and no JavaScript exceptions.
The release build also validates navigation permissions, product identity,
compatible model switching, exact image selection, and document snapshots.
