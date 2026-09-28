# Door showroom and estimate photos

The existing Products catalog remains authoritative. Gallery has Door Catalog, Project Photos and Style Inspiration views. Model cards filter by confirmed size, color, type and manufacturer. Missing metadata is left blank.

Owner uploads can select multiple photos for one model, choose a cover, link the existing product ID and explicitly use the cover as that product's catalog photo. Original projects and photo tags are preserved. Choosing a particular project photo uses that exact photo and its size/color in the estimate.

New estimate/invoice saves convert selected photos into bounded JPEG snapshots within the line item. Public signing, CRM preview and PDF use the snapshot; later catalog edits and expiring upload URLs cannot change it. Existing documents without a selected image are not silently backfilled. Price, tax and the separate labor workflow remain unchanged.

Eight AI illustrations are included in Style Inspiration: four double-door styles and four single-car styles. These have no manufacturer/model/verified dimensions and are never automatically attached to real catalog products.

Next content step, when David supplies the photos: group by exact model, size, color and type; leave unconfirmed attributes for review; bulk-upload and link confirmed photos. No real project/model associations have been invented or seeded into production.

Social Media Posts contains Instagram, Facebook and Google Business Profile setup cards. Connections and publishing are intentionally disabled until the final integration stage.

Verification: complete release build and targeted behavior audit pass. Isolated desktop/mobile browser fixture passed catalog-to-estimate, immutable image snapshot after catalog change, PDF generation, exact photo selection, batch upload/default image association, eight style assets, deferred social controls, before/after thumbnail switching and Visualizer search focus. The fixture uses no production customer data.
