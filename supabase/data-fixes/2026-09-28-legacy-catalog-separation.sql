-- One-time repair of 84 pre-master catalog defaults. No schema change.
-- Preserves IDs, names, rates, costs, custom products, master catalog and documents.
-- Aborts atomically if any reviewed record was edited since the snapshot.
-- Use the existing service maintenance role accepted by the app_data trigger.
-- This does not change grants, RLS policies, triggers, or user permissions.
BEGIN;
SET LOCAL ROLE service_role;
DO $repair$
DECLARE
  changed integer;
  corrections jsonb := $catalog$[
  {
    "id": "s4t893fz3qyzcohqtn3u",
    "name": "Torsion Spring Replacement",
    "old_details": "Removal of the existing torsion spring and installation of a properly sized replacement torsion spring. Includes installation, system adjustment, door balancing, lubrication where applicable, and complete operational testing.",
    "old_taxable": true,
    "old_app_data": {},
    "new_details": "Removal of the existing torsion spring and installation of a properly sized replacement torsion spring. Includes installation, system adjustment, door balancing, lubrication where applicable, and complete operational testing. Labor only; physical parts are separate line items.",
    "item_type": "labor",
    "related_labor_ids": []
  },
  {
    "id": "5htkynt8bo24jtiria7r",
    "name": "Torsion Spring Replacement — Pair",
    "old_details": "Replacement of both torsion springs on a two-spring garage door system. Includes removal of existing springs, installation of properly sized replacement springs, balancing, adjustment, lubrication, and complete operational testing.",
    "old_taxable": true,
    "old_app_data": {},
    "new_details": "Replacement of both torsion springs on a two-spring garage door system. Includes removal of existing springs, installation of properly sized replacement springs, balancing, adjustment, lubrication, and complete operational testing. Labor only; physical parts are separate line items.",
    "item_type": "labor",
    "related_labor_ids": []
  },
  {
    "id": "6w3wcx63n3454t1rc52y",
    "name": "High-Cycle Torsion Spring Upgrade",
    "old_details": "Upgrade to properly sized high-cycle torsion springs designed for increased service life compared with standard-cycle spring options. Includes installation, balancing, adjustment, and system testing.",
    "old_taxable": true,
    "old_app_data": {},
    "new_details": "Upgrade to properly sized high-cycle torsion springs designed for increased service life compared with standard-cycle spring options. Includes installation, balancing, adjustment, and system testing. Labor only; physical parts are separate line items.",
    "item_type": "labor",
    "related_labor_ids": []
  },
  {
    "id": "clmk088p5wwu8zj7mzsz",
    "name": "Extension Spring Replacement",
    "old_details": "Replacement of damaged or worn extension spring(s). Includes proper spring sizing, installation, adjustment, door balancing, and operational testing.",
    "old_taxable": true,
    "old_app_data": {},
    "new_details": "Replacement of damaged or worn extension spring(s). Includes proper spring sizing, installation, adjustment, door balancing, and operational testing. Labor only; physical parts are separate line items.",
    "item_type": "labor",
    "related_labor_ids": []
  },
  {
    "id": "qgok38xz3lq2zptz5gvj",
    "name": "Extension Spring Replacement — Pair",
    "old_details": "Replacement of both extension springs to maintain balanced lifting performance. Includes installation, adjustment, safety inspection, lubrication, and testing.",
    "old_taxable": true,
    "old_app_data": {},
    "new_details": "Replacement of both extension springs to maintain balanced lifting performance. Includes installation, adjustment, safety inspection, lubrication, and testing. Labor only; physical parts are separate line items.",
    "item_type": "labor",
    "related_labor_ids": []
  },
  {
    "id": "b57jcak3io5o0t0lxm1w",
    "name": "Spring System Inspection & Adjustment",
    "old_details": "Inspection of the garage door spring system for wear, balance, tension, mounting condition, and proper operation. Includes adjustments where applicable.",
    "old_taxable": true,
    "old_app_data": {},
    "new_details": "Inspection of the garage door spring system for wear, balance, tension, mounting condition, and proper operation. Includes adjustments where applicable. Labor only; physical parts are separate line items.",
    "item_type": "labor",
    "related_labor_ids": []
  },
  {
    "id": "dt9p52j450a6lpc3t0kn",
    "name": "Garage Door Repair",
    "old_details": "Professional inspection and repair of the garage door system based on the diagnosed issue. Includes adjustment and operational testing of repaired components.",
    "old_taxable": true,
    "old_app_data": {},
    "new_details": "Professional inspection and repair of the garage door system based on the diagnosed issue. Includes adjustment and operational testing of repaired components. Labor only; physical parts are separate line items.",
    "item_type": "labor",
    "related_labor_ids": []
  },
  {
    "id": "th6eeoabzebf9v27rg4l",
    "name": "Off-Track Repair",
    "old_details": "Professional realignment of the garage door and inspection of the affected rollers, tracks, cables, brackets, and related hardware. Includes necessary adjustments and operational testing.",
    "old_taxable": true,
    "old_app_data": {},
    "new_details": "Professional realignment of the garage door and inspection of the affected rollers, tracks, cables, brackets, and related hardware. Includes necessary adjustments and operational testing. Labor only; physical parts are separate line items.",
    "item_type": "labor",
    "related_labor_ids": []
  },
  {
    "id": "5c9tm7z38gaodxzm7c9t",
    "name": "Broken Cable Replacement",
    "old_details": "Replacement of damaged, frayed, or broken garage door lift cable(s). Includes installation, tension adjustment, door balancing, and safety testing.",
    "old_taxable": true,
    "old_app_data": {},
    "new_details": "Replacement of damaged, frayed, or broken garage door lift cable(s). Includes installation, tension adjustment, door balancing, and safety testing. Labor only; physical parts are separate line items.",
    "item_type": "labor",
    "related_labor_ids": []
  },
  {
    "id": "4tqxl9e4ujbw7hui0z0j",
    "name": "Cable Pair Replacement",
    "old_details": "Replacement of both garage door lift cables to maintain balanced and safe door operation. Includes installation, tension adjustment, door balancing, and safety testing.",
    "old_taxable": true,
    "old_app_data": {},
    "new_details": "Replacement of both garage door lift cables to maintain balanced and safe door operation. Includes installation, tension adjustment, door balancing, and safety testing. Labor only; physical parts are separate line items.",
    "item_type": "labor",
    "related_labor_ids": []
  },
  {
    "id": "jqaxtl8t13kk5o8o1zw7",
    "name": "Roller Replacement",
    "old_details": "Replacement of worn or damaged garage door rollers to restore smoother and more reliable door movement.",
    "old_taxable": true,
    "old_app_data": {},
    "new_details": "Replacement of worn or damaged garage door rollers to restore smoother and more reliable door movement. Labor only; physical parts are separate line items.",
    "item_type": "labor",
    "related_labor_ids": []
  },
  {
    "id": "81ckizlclw35itdvnnc9",
    "name": "Premium Quiet Roller Upgrade",
    "old_details": "Upgrade of existing garage door rollers to premium low-noise rollers designed to provide smoother and quieter door operation.",
    "old_taxable": true,
    "old_app_data": {},
    "new_details": "Upgrade of existing garage door rollers to premium low-noise rollers designed to provide smoother and quieter door operation. Labor only; physical parts are separate line items.",
    "item_type": "labor",
    "related_labor_ids": []
  },
  {
    "id": "mqothxzik01xfpncag6h",
    "name": "Hinge Replacement",
    "old_details": "Replacement of damaged or worn garage door hinge(s), including proper alignment and operational testing.",
    "old_taxable": true,
    "old_app_data": {},
    "new_details": "Replacement of damaged or worn garage door hinge(s), including proper alignment and operational testing. Labor only; physical parts are separate line items.",
    "item_type": "labor",
    "related_labor_ids": []
  },
  {
    "id": "7uh0xqrwan8ig8jm5orq",
    "name": "Track Adjustment",
    "old_details": "Inspection and adjustment of garage door tracks to improve alignment and proper door travel.",
    "old_taxable": true,
    "old_app_data": {},
    "new_details": "Inspection and adjustment of garage door tracks to improve alignment and proper door travel. Labor only; physical parts are separate line items.",
    "item_type": "labor",
    "related_labor_ids": []
  },
  {
    "id": "hwu69xk2rmcc7it9kd9l",
    "name": "Track Repair",
    "old_details": "Repair of damaged or misaligned garage door track sections. Includes adjustment and operational testing to restore proper door travel.",
    "old_taxable": true,
    "old_app_data": {},
    "new_details": "Repair of damaged or misaligned garage door track sections. Includes adjustment and operational testing to restore proper door travel. Labor only; physical parts are separate line items.",
    "item_type": "labor",
    "related_labor_ids": []
  },
  {
    "id": "azllcgunwwg9xifu3mrl",
    "name": "Bracket Repair / Replacement",
    "old_details": "Repair or replacement of damaged garage door mounting or support brackets as required.",
    "old_taxable": true,
    "old_app_data": {},
    "new_details": "Repair or replacement of damaged garage door mounting or support brackets as required. Labor only; physical parts are separate line items.",
    "item_type": "labor",
    "related_labor_ids": []
  },
  {
    "id": "0zeuci3eh0mceiu0ik5s",
    "name": "Door Balance Adjustment",
    "old_details": "Adjustment of the garage door lifting system to improve proper balance and controlled manual operation.",
    "old_taxable": true,
    "old_app_data": {},
    "new_details": "Adjustment of the garage door lifting system to improve proper balance and controlled manual operation. Labor only; physical parts are separate line items.",
    "item_type": "labor",
    "related_labor_ids": []
  },
  {
    "id": "pgxm10g0zphgzb4yujqh",
    "name": "Noisy Door Service",
    "old_details": "Inspection and adjustment of components contributing to excessive garage door noise. Includes lubrication and operational testing where applicable.",
    "old_taxable": true,
    "old_app_data": {},
    "new_details": "Inspection and adjustment of components contributing to excessive garage door noise. Includes lubrication and operational testing where applicable. Labor only; physical parts are separate line items.",
    "item_type": "labor",
    "related_labor_ids": []
  },
  {
    "id": "h9oqro18rthd1kx552j4",
    "name": "Panel / Section Repair",
    "old_details": "Repair of a damaged garage door panel or section. Includes fitting, alignment, and operational testing of the repaired area.",
    "old_taxable": true,
    "old_app_data": {},
    "new_details": "Repair of a damaged garage door panel or section. Includes fitting, alignment, and operational testing of the repaired area. Labor only; physical parts are separate line items.",
    "item_type": "labor",
    "related_labor_ids": []
  },
  {
    "id": "pxpat1zyzh6lms1eoc9l",
    "name": "Garage Door Diagnostic",
    "old_details": "Complete inspection of the garage door and operating system to identify the cause of improper operation and determine recommended repairs.",
    "old_taxable": true,
    "old_app_data": {},
    "new_details": "Complete inspection of the garage door and operating system to identify the cause of improper operation and determine recommended repairs. Labor only; physical parts are separate line items.",
    "item_type": "labor",
    "related_labor_ids": []
  },
  {
    "id": "hfrdh855eoauc3sqyqm2",
    "name": "Garage Door Opener Repair",
    "old_details": "Diagnosis and repair of garage door opener operation, including inspection of controls, safety sensors, travel settings, force settings, rail system, and related components as applicable.",
    "old_taxable": true,
    "old_app_data": {},
    "new_details": "Diagnosis and repair of garage door opener operation, including inspection of controls, safety sensors, travel settings, force settings, rail system, and related components as applicable. Labor only; physical parts are separate line items.",
    "item_type": "labor",
    "related_labor_ids": []
  },
  {
    "id": "yzlak1n1mfv8x9jus2f9",
    "name": "Garage Door Opener Replacement",
    "old_details": "Removal of the existing garage door opener and installation of a replacement opener. Includes mounting, connection, setup, safety sensor alignment, travel/force adjustment, programming, and complete operational testing.",
    "old_taxable": true,
    "old_app_data": {},
    "new_details": "Removal of the existing garage door opener and installation of a replacement opener. Includes mounting, connection, setup, safety sensor alignment, travel/force adjustment, programming, and complete operational testing. Labor only; physical parts are separate line items.",
    "item_type": "labor",
    "related_labor_ids": []
  },
  {
    "id": "7uth0jdaywb180nm8psq",
    "name": "LiftMaster Belt Drive Opener",
    "old_details": "Professional installation of a LiftMaster belt-drive garage door opener. Includes opener assembly, rail installation, safety sensors, wall control, remote programming, travel adjustment, and operational testing.",
    "old_taxable": true,
    "old_app_data": {},
    "new_details": "LiftMaster garage door opener with a belt-drive mechanism; model, rail configuration, capacity, and included controls match the selected specification.",
    "item_type": "product",
    "related_labor_ids": [
      "master_labor_opener_install",
      "master_labor_opener_replace"
    ]
  },
  {
    "id": "c1wbly57ehnvu9rp2sui",
    "name": "LiftMaster Chain Drive Opener",
    "old_details": "Professional installation of a LiftMaster chain-drive garage door opener. Includes opener assembly, rail installation, safety sensors, wall control, remote programming, travel adjustment, and operational testing.",
    "old_taxable": true,
    "old_app_data": {},
    "new_details": "LiftMaster garage door opener with a chain-drive mechanism; model, rail configuration, capacity, and included controls match the selected specification.",
    "item_type": "product",
    "related_labor_ids": [
      "master_labor_opener_install",
      "master_labor_opener_replace"
    ]
  },
  {
    "id": "l7t4vxoiza04l722gv6c",
    "name": "LiftMaster Wall-Mount Opener",
    "old_details": "Professional installation and setup of a compatible LiftMaster wall-mount garage door opener system, including required controls, safety components, programming, adjustment, and testing.",
    "old_taxable": true,
    "old_app_data": {},
    "new_details": "LiftMaster wall-mount garage door opener for a compatible torsion-shaft door system; model and included accessories match the selected specification.",
    "item_type": "product",
    "related_labor_ids": [
      "master_labor_opener_install",
      "master_labor_opener_replace"
    ]
  },
  {
    "id": "s9odq80daon4wekufq78",
    "name": "Opener Rail Replacement",
    "old_details": "Replacement of a compatible garage door opener rail assembly, followed by adjustment and operational testing.",
    "old_taxable": true,
    "old_app_data": {},
    "new_details": "Replacement of a compatible garage door opener rail assembly, followed by adjustment and operational testing. Labor only; physical parts are separate line items.",
    "item_type": "labor",
    "related_labor_ids": []
  },
  {
    "id": "aqiwzmurex154wvpqus3",
    "name": "Opener Drive / Gear Repair",
    "old_details": "Repair or replacement of applicable garage door opener drive components after diagnosis of the opener system.",
    "old_taxable": true,
    "old_app_data": {},
    "new_details": "Repair or replacement of applicable garage door opener drive components after diagnosis of the opener system. Labor only; physical parts are separate line items.",
    "item_type": "labor",
    "related_labor_ids": []
  },
  {
    "id": "qe3uac6n29t34z40howx",
    "name": "Safety Sensor Replacement",
    "old_details": "Replacement and alignment of garage door opener safety sensors followed by safety-reversal and operational testing.",
    "old_taxable": true,
    "old_app_data": {},
    "new_details": "Replacement and alignment of garage door opener safety sensors followed by safety-reversal and operational testing. Labor only; physical parts are separate line items.",
    "item_type": "labor",
    "related_labor_ids": []
  },
  {
    "id": "z4li7s7na6a3hh260h58",
    "name": "Safety Sensor Alignment",
    "old_details": "Inspection, alignment, and testing of garage door opener safety sensors to restore proper operation.",
    "old_taxable": true,
    "old_app_data": {},
    "new_details": "Inspection, alignment, and testing of garage door opener safety sensors to restore proper operation. Labor only; physical parts are separate line items.",
    "item_type": "labor",
    "related_labor_ids": []
  },
  {
    "id": "5s6gxfmg84xkb3k0fuih",
    "name": "Wall Control Replacement",
    "old_details": "Replacement and setup of the garage door opener wall-mounted control panel, including programming and operational testing.",
    "old_taxable": true,
    "old_app_data": {},
    "new_details": "Replacement and setup of the garage door opener wall-mounted control panel, including programming and operational testing. Labor only; physical parts are separate line items.",
    "item_type": "labor",
    "related_labor_ids": []
  },
  {
    "id": "m0xxmc13lp9xy89etx8a",
    "name": "Battery Backup",
    "old_details": "Supply and installation of a compatible garage door opener battery backup unit to help maintain operation during a power outage, including testing.",
    "old_taxable": true,
    "old_app_data": {},
    "new_details": "Backup battery or battery unit compatible with the selected garage door opener, for operation during a power outage.",
    "item_type": "product",
    "related_labor_ids": [
      "master_labor_project"
    ]
  },
  {
    "id": "3ruf9dr4n1h3l42qncup",
    "name": "Opener Reinforcement Bracket",
    "old_details": "Installation of an opener reinforcement bracket to provide additional mounting support for the garage door opener rail system.",
    "old_taxable": true,
    "old_app_data": {},
    "new_details": "Garage door reinforcement bracket providing support at the opener door-arm connection.",
    "item_type": "product",
    "related_labor_ids": [
      "master_labor_opener_bracket"
    ]
  },
  {
    "id": "5o94lphix1gnp9vjse8u",
    "name": "Remote Control",
    "old_details": "Supply and programming of a compatible garage door opener remote control.",
    "old_taxable": true,
    "old_app_data": {},
    "new_details": "Wireless remote control compatible with the selected garage door opener, radio protocol, and button configuration.",
    "item_type": "product",
    "related_labor_ids": [
      "master_labor_remote_programming"
    ]
  },
  {
    "id": "ytrb43v5uumxphg4keey",
    "name": "Remote Programming",
    "old_details": "Programming and testing of a compatible garage door remote control with the existing opener.",
    "old_taxable": true,
    "old_app_data": {},
    "new_details": "Programming and testing of a compatible garage door remote control with the existing opener. Labor only; physical parts are separate line items.",
    "item_type": "labor",
    "related_labor_ids": []
  },
  {
    "id": "nquslzjcenq4i0c8zrnf",
    "name": "Wireless Keypad",
    "old_details": "Supply, installation, programming, and testing of a compatible exterior wireless garage door keypad.",
    "old_taxable": true,
    "old_app_data": {},
    "new_details": "Exterior wireless keypad compatible with the selected garage door opener and radio protocol.",
    "item_type": "product",
    "related_labor_ids": [
      "master_labor_keypad_programming"
    ]
  },
  {
    "id": "xj01q0081wsh0vl18uo1",
    "name": "Keypad Programming",
    "old_details": "Programming and testing of a compatible garage door opener keypad.",
    "old_taxable": true,
    "old_app_data": {},
    "new_details": "Programming and testing of a compatible garage door opener keypad. Labor only; physical parts are separate line items.",
    "item_type": "labor",
    "related_labor_ids": []
  },
  {
    "id": "cpfpsemv8b0vry2xgq2e",
    "name": "Vehicle Programming",
    "old_details": "Programming assistance for a compatible vehicle-integrated garage door control system.",
    "old_taxable": true,
    "old_app_data": {},
    "new_details": "Programming assistance for a compatible vehicle-integrated garage door control system. Labor only; physical parts are separate line items.",
    "item_type": "labor",
    "related_labor_ids": []
  },
  {
    "id": "uk8n5o4g701tyxe426yi",
    "name": "Smart / Wi-Fi Opener Setup",
    "old_details": "Setup and configuration assistance for compatible smart garage door opener connectivity and mobile-app functionality.",
    "old_taxable": true,
    "old_app_data": {},
    "new_details": "Setup and configuration assistance for compatible smart garage door opener connectivity and mobile-app functionality. Labor only; physical parts are separate line items.",
    "item_type": "labor",
    "related_labor_ids": []
  },
  {
    "id": "yzpzfisl3eeg2r2m2atq",
    "name": "Lift Cable — Single",
    "old_details": "Supply and installation of a single garage door lift cable, including tension adjustment and safety testing.",
    "old_taxable": true,
    "old_app_data": {},
    "new_details": "Single garage door lift cable with the selected length, diameter, and end fittings.",
    "item_type": "product",
    "related_labor_ids": [
      "master_labor_cable_replacement"
    ]
  },
  {
    "id": "ilhni9907u62puulwycz",
    "name": "Lift Cable — Pair",
    "old_details": "Supply and installation of a pair of garage door lift cables, including tension adjustment, balancing, and safety testing.",
    "old_taxable": true,
    "old_app_data": {},
    "new_details": "Pair of garage door lift cables with the selected length, diameter, and end fittings.",
    "item_type": "product",
    "related_labor_ids": [
      "master_labor_cable_replacement"
    ]
  },
  {
    "id": "1zj5mu5acleea1jwjgib",
    "name": "Cable Drum",
    "old_details": "Supply and installation of a replacement garage door cable drum, including adjustment and operational testing.",
    "old_taxable": true,
    "old_app_data": {},
    "new_details": "Grooved cable drum that guides the lift cable on the torsion shaft; size and configuration match the door system.",
    "item_type": "product",
    "related_labor_ids": [
      "master_labor_drum_replacement"
    ]
  },
  {
    "id": "zhnho1ph9wz8vhaefn7t",
    "name": "Torsion Tube",
    "old_details": "Supply and installation of a replacement torsion tube (shaft), including adjustment and operational testing.",
    "old_taxable": true,
    "old_app_data": {},
    "new_details": "Torsion shaft or tube supporting compatible garage door springs and cable drums, in the selected diameter and length.",
    "item_type": "product",
    "related_labor_ids": [
      "master_labor_torsion_shaft"
    ]
  },
  {
    "id": "d1wkvc8j36mgbskr3asp",
    "name": "Center Bearing",
    "old_details": "Supply and installation of a replacement center bearing, including adjustment and operational testing.",
    "old_taxable": true,
    "old_app_data": {},
    "new_details": "Center support bearing for a compatible garage door torsion shaft.",
    "item_type": "product",
    "related_labor_ids": [
      "master_labor_bearing_replacement"
    ]
  },
  {
    "id": "ofr1t266w833hl0ckxtx",
    "name": "End Bearing",
    "old_details": "Supply and installation of a replacement end bearing, including adjustment and operational testing.",
    "old_taxable": true,
    "old_app_data": {},
    "new_details": "End support bearing for a compatible garage door torsion shaft.",
    "item_type": "product",
    "related_labor_ids": [
      "master_labor_bearing_replacement"
    ]
  },
  {
    "id": "dyr03yz9ybbpj36gv61t",
    "name": "Bearing Plate",
    "old_details": "Supply and installation of a replacement bearing plate, including adjustment and operational testing.",
    "old_taxable": true,
    "old_app_data": {},
    "new_details": "Garage door bearing support plate compatible with the selected torsion shaft and mounting arrangement.",
    "item_type": "product",
    "related_labor_ids": [
      "master_labor_bearing_replacement"
    ]
  },
  {
    "id": "5qshgzmbgxspao3jxdmn",
    "name": "Bottom Bracket",
    "old_details": "Supply and installation of a replacement bottom bracket, including adjustment and operational testing.",
    "old_taxable": true,
    "old_app_data": {},
    "new_details": "Garage door bottom bracket with a lift-cable attachment point and hardware compatibility for the selected door.",
    "item_type": "product",
    "related_labor_ids": [
      "master_labor_project"
    ]
  },
  {
    "id": "juxfas5b6q32x4urh7xo",
    "name": "Top Fixture",
    "old_details": "Supply and installation of a replacement top fixture, including adjustment and operational testing.",
    "old_taxable": true,
    "old_app_data": {},
    "new_details": "Adjustable top roller fixture compatible with the selected garage door section and track arrangement.",
    "item_type": "product",
    "related_labor_ids": [
      "master_labor_project"
    ]
  },
  {
    "id": "nwh0fb5kuyc31ex0mw1b",
    "name": "Hinge",
    "old_details": "Supply and installation of a replacement garage door hinge, including adjustment and operational testing.",
    "old_taxable": true,
    "old_app_data": {},
    "new_details": "Garage door hinge connecting adjacent sections; hinge number, gauge, and configuration match the selected location.",
    "item_type": "product",
    "related_labor_ids": [
      "master_labor_hinge_replacement"
    ]
  },
  {
    "id": "2yyhs8rvnop9cwmjln7a",
    "name": "Roller",
    "old_details": "Supply and installation of a replacement garage door roller, including adjustment and operational testing.",
    "old_taxable": true,
    "old_app_data": {},
    "new_details": "Garage door roller with the selected wheel diameter, stem length, material, and bearing design.",
    "item_type": "product",
    "related_labor_ids": [
      "master_labor_roller_replacement"
    ]
  },
  {
    "id": "fk3lfiuudnn9ezi449vb",
    "name": "Premium Quiet Roller",
    "old_details": "Supply and installation of a premium low-noise garage door roller, including adjustment and operational testing.",
    "old_taxable": true,
    "old_app_data": {},
    "new_details": "Low-noise garage door roller with the selected wheel material, bearing design, diameter, and stem length.",
    "item_type": "product",
    "related_labor_ids": [
      "master_labor_roller_replacement"
    ]
  },
  {
    "id": "bijgi9hofkzeh8nkt88l",
    "name": "Reinforcement Strut",
    "old_details": "Supply and installation of a garage door reinforcement strut to help maintain panel rigidity, including adjustment and testing.",
    "old_taxable": true,
    "old_app_data": {},
    "new_details": "Reinforcement strut that supports garage door section rigidity; length and profile match the selected door.",
    "item_type": "product",
    "related_labor_ids": [
      "master_labor_strut"
    ]
  },
  {
    "id": "08kuc8o3b1zalumn09e6",
    "name": "Pulley",
    "old_details": "Supply and installation of a replacement garage door pulley, including adjustment and operational testing.",
    "old_taxable": true,
    "old_app_data": {},
    "new_details": "Garage door cable pulley with the selected diameter, bearing, and mounting compatibility.",
    "item_type": "product",
    "related_labor_ids": [
      "master_labor_project"
    ]
  },
  {
    "id": "5wo84sq25imp0l4h9pu3",
    "name": "Extension Spring Safety Cable",
    "old_details": "Supply and installation of an extension spring safety cable, designed to help contain the spring in the event of failure.",
    "old_taxable": true,
    "old_app_data": {},
    "new_details": "Safety cable that passes through a compatible extension spring to help contain the spring if it breaks.",
    "item_type": "product",
    "related_labor_ids": [
      "master_labor_project"
    ]
  },
  {
    "id": "ja4keh5ko7avwz5oi0ji",
    "name": "J-Arm / Door Arm",
    "old_details": "Supply and installation of a replacement opener J-arm/door arm, including adjustment and operational testing.",
    "old_taxable": true,
    "old_app_data": {},
    "new_details": "Door arm linking a compatible garage door opener carriage to the door bracket.",
    "item_type": "product",
    "related_labor_ids": [
      "master_labor_project"
    ]
  },
  {
    "id": "sjwi6itj93a3c8a369yx",
    "name": "Emergency Release",
    "old_details": "Supply and installation of a replacement garage door opener emergency release mechanism, including testing.",
    "old_taxable": true,
    "old_app_data": {},
    "new_details": "Garage door opener emergency release component for disengaging a compatible opener carriage.",
    "item_type": "product",
    "related_labor_ids": [
      "master_labor_project"
    ]
  },
  {
    "id": "vm77g3u6290ol07a0mpt",
    "name": "Bottom Retainer",
    "old_details": "Supply and installation of a replacement bottom seal retainer track, including fitting of the bottom seal and operational testing.",
    "old_taxable": true,
    "old_app_data": {},
    "new_details": "Retainer channel that holds the garage door bottom seal; profile and length match the selected door.",
    "item_type": "product",
    "related_labor_ids": [
      "master_labor_bottom_retainer"
    ]
  },
  {
    "id": "4x4o3xe6vctzg8x0pzqr",
    "name": "Bottom Weather Seal",
    "old_details": "Removal of the existing bottom seal and installation of a replacement garage door bottom weather seal to help reduce drafts, moisture, debris, and outside air infiltration.",
    "old_taxable": true,
    "old_app_data": {},
    "new_details": "Flexible garage door bottom seal with the selected profile, material, and length for the compatible retainer.",
    "item_type": "product",
    "related_labor_ids": [
      "master_labor_bottom_seal"
    ]
  },
  {
    "id": "ih4rm3hrd9xbb34uckjz",
    "name": "Perimeter Weather Seal",
    "old_details": "Installation or replacement of garage door perimeter weather seal along the sides and top of the opening.",
    "old_taxable": true,
    "old_app_data": {},
    "new_details": "Weather seal for the top and sides of the garage door opening, with the selected profile, finish, and lengths.",
    "item_type": "product",
    "related_labor_ids": [
      "master_labor_perimeter_seal"
    ]
  },
  {
    "id": "8ozzrkyuv0z33ztg7cyj",
    "name": "Threshold Seal",
    "old_details": "Installation of a floor-mounted garage door threshold seal designed to help reduce water, debris, and drafts entering beneath the garage door.",
    "old_taxable": true,
    "old_app_data": {},
    "new_details": "Floor-mounted garage door threshold strip with the selected profile and length, designed to reduce gaps beneath the door.",
    "item_type": "product",
    "related_labor_ids": [
      "master_labor_project"
    ]
  },
  {
    "id": "8o37gczad4a2pwjsgcvy",
    "name": "Complete Weather Seal Package",
    "old_details": "Replacement/installation of applicable bottom and perimeter garage door weather seals for improved sealing around the garage door opening.",
    "old_taxable": true,
    "old_app_data": {},
    "new_details": "Set of bottom and perimeter weather seals for the selected garage door opening, profiles, and dimensions.",
    "item_type": "product",
    "related_labor_ids": [
      "master_labor_bottom_seal",
      "master_labor_perimeter_seal"
    ]
  },
  {
    "id": "5rb8puvadfutlhja5amc",
    "name": "Garage Door Tune-Up",
    "old_details": "General garage door maintenance including inspection of major moving components, lubrication where applicable, hardware inspection, balance check, safety inspection, adjustments where appropriate, and operational testing.",
    "old_taxable": true,
    "old_app_data": {},
    "new_details": "General garage door maintenance including inspection of major moving components, lubrication where applicable, hardware inspection, balance check, safety inspection, adjustments where appropriate, and operational testing. Labor only; physical parts are separate line items.",
    "item_type": "labor",
    "related_labor_ids": []
  },
  {
    "id": "issl067acfd5dfm140f9",
    "name": "Preventive Maintenance",
    "old_details": "Preventive inspection and maintenance of the garage door system to identify wear and help maintain proper operation.",
    "old_taxable": true,
    "old_app_data": {},
    "new_details": "Preventive inspection and maintenance of the garage door system to identify wear and help maintain proper operation. Labor only; physical parts are separate line items.",
    "item_type": "labor",
    "related_labor_ids": []
  },
  {
    "id": "qsw8vv2rzhvq5ke6idtd",
    "name": "Safety Inspection",
    "old_details": "Inspection of major garage door components and safety-related operation, including springs, cables, rollers, tracks, hardware, opener, and safety sensors where applicable.",
    "old_taxable": true,
    "old_app_data": {},
    "new_details": "Inspection of major garage door components and safety-related operation, including springs, cables, rollers, tracks, hardware, opener, and safety sensors where applicable. Labor only; physical parts are separate line items.",
    "item_type": "labor",
    "related_labor_ids": []
  },
  {
    "id": "firu89m0t3sd3yyaj01r",
    "name": "Lubrication",
    "old_details": "Lubrication of applicable garage door moving components, including hinges, rollers, and tracks, to help support smooth and quiet operation.",
    "old_taxable": true,
    "old_app_data": {},
    "new_details": "Lubrication of applicable garage door moving components, including hinges, rollers, and tracks, to help support smooth and quiet operation. Labor only; physical parts are separate line items.",
    "item_type": "labor",
    "related_labor_ids": []
  },
  {
    "id": "coqgxazabv9ieluponhy",
    "name": "Door Adjustment / Leveling",
    "old_details": "Adjustment and leveling of the garage door system to help restore proper alignment and operation.",
    "old_taxable": true,
    "old_app_data": {},
    "new_details": "Adjustment and leveling of the garage door system to help restore proper alignment and operation. Labor only; physical parts are separate line items.",
    "item_type": "labor",
    "related_labor_ids": []
  },
  {
    "id": "jz71hayh3a7jpnri01xh",
    "name": "New Garage Door",
    "old_details": "Supply of a new garage door according to the manufacturer, model, size, color, construction, and options selected on the estimate.",
    "old_taxable": true,
    "old_app_data": {},
    "new_details": "Garage door assembly with the selected model, dimensions, finish, construction, and panel design.",
    "item_type": "product",
    "related_labor_ids": [
      "master_labor_door_install",
      "master_labor_door_replace"
    ]
  },
  {
    "id": "8n9ududeug9yulrg2wad",
    "name": "Garage Door Replacement",
    "old_details": "Removal of the existing garage door and professional installation of the selected replacement garage door system according to the approved scope of work.",
    "old_taxable": true,
    "old_app_data": {},
    "new_details": "Removal of the existing garage door and professional installation of the selected replacement garage door system according to the approved scope of work. Labor only; physical parts are separate line items.",
    "item_type": "labor",
    "related_labor_ids": []
  },
  {
    "id": "eivrpcv2xlhjdjm2i1wz",
    "name": "Single Door Installation",
    "old_details": "Professional installation of a single-car garage door according to the approved scope of work, including fitting, hardware installation, balancing, and operational testing.",
    "old_taxable": true,
    "old_app_data": {},
    "new_details": "Professional installation of a single-car garage door according to the approved scope of work, including fitting, hardware installation, balancing, and operational testing. Labor only; physical parts are separate line items.",
    "item_type": "labor",
    "related_labor_ids": []
  },
  {
    "id": "ikeseh1opfhcjx1x7fbe",
    "name": "Double Door Installation",
    "old_details": "Professional installation of a double-car (two-car) garage door according to the approved scope of work, including fitting, hardware installation, balancing, and operational testing.",
    "old_taxable": true,
    "old_app_data": {},
    "new_details": "Professional installation of a double-car (two-car) garage door according to the approved scope of work, including fitting, hardware installation, balancing, and operational testing. Labor only; physical parts are separate line items.",
    "item_type": "labor",
    "related_labor_ids": []
  },
  {
    "id": "fb4v6jfd1hm8lcn0per1",
    "name": "Insulated Garage Door",
    "old_details": "Supply of an insulated garage door according to the manufacturer, model, size, color, and options selected on the estimate.",
    "old_taxable": true,
    "old_app_data": {},
    "new_details": "Garage door with an insulated core; manufacturer, model, dimensions, finish, and insulation rating match the selected specification.",
    "item_type": "product",
    "related_labor_ids": [
      "master_labor_door_install",
      "master_labor_door_replace"
    ]
  },
  {
    "id": "gzo6wx4hlljyt974io2y",
    "name": "Non-Insulated Garage Door",
    "old_details": "Supply of a non-insulated garage door according to the manufacturer, model, size, color, and options selected on the estimate.",
    "old_taxable": true,
    "old_app_data": {},
    "new_details": "Garage door without an insulated core, in the selected model, dimensions, finish, and panel design.",
    "item_type": "product",
    "related_labor_ids": [
      "master_labor_door_install",
      "master_labor_door_replace"
    ]
  },
  {
    "id": "j7kl3yo72lzlfino6e9k",
    "name": "Steel-Back Insulated Door",
    "old_details": "Supply of a steel-back insulated garage door according to the manufacturer, model, size, color, and options selected on the estimate.",
    "old_taxable": true,
    "old_app_data": {},
    "new_details": "Insulated garage door with an interior steel backing and the selected panel design, dimensions, finish, and insulation specification.",
    "item_type": "product",
    "related_labor_ids": [
      "master_labor_door_install",
      "master_labor_door_replace"
    ]
  },
  {
    "id": "to0cjcogo84hm9zqd82u",
    "name": "Window Upgrade",
    "old_details": "Upgrade of the garage door with the selected window option according to the approved scope of work.",
    "old_taxable": true,
    "old_app_data": {},
    "new_details": "Garage door window option with the selected glass, frame, insert pattern, and panel compatibility.",
    "item_type": "product",
    "related_labor_ids": [
      "master_labor_panel_replace"
    ]
  },
  {
    "id": "yc4z9wm11g22chvpuvs6",
    "name": "Decorative Hardware Package",
    "old_details": "Supply and installation of a decorative hardware package for the garage door according to the options selected on the estimate.",
    "old_taxable": true,
    "old_app_data": {},
    "new_details": "Decorative handles, hinges, and accent hardware for the selected garage door design.",
    "item_type": "product",
    "related_labor_ids": [
      "master_labor_project"
    ]
  },
  {
    "id": "cy51lqpv5fwqf04lh07z",
    "name": "Premium Hardware Package",
    "old_details": "Supply and installation of a premium hardware package for the garage door according to the options selected on the estimate.",
    "old_taxable": true,
    "old_app_data": {},
    "new_details": "Garage door hardware set with the selected rollers, hinges, brackets, and other listed components.",
    "item_type": "product",
    "related_labor_ids": [
      "master_labor_project"
    ]
  },
  {
    "id": "m4k7umniibbkhbamk3w1",
    "name": "Service Call / Diagnostic",
    "old_details": "Technician visit to diagnose the reported garage door issue and determine the recommended repair.",
    "old_taxable": false,
    "old_app_data": {},
    "new_details": "Technician visit to diagnose the reported garage door issue and determine the recommended repair. Labor only; physical parts are separate line items.",
    "item_type": "labor",
    "related_labor_ids": []
  },
  {
    "id": "jvdhcdrbgj4w3659bqr0",
    "name": "Garage Door Repair Labor",
    "old_details": "Labor for the diagnosed garage door repair work performed.",
    "old_taxable": false,
    "old_app_data": {},
    "new_details": "Labor for the diagnosed garage door repair work performed. Labor only; physical parts are separate line items.",
    "item_type": "labor",
    "related_labor_ids": []
  },
  {
    "id": "yp4rii2efhgfgfvyvb5y",
    "name": "Garage Door Installation Labor",
    "old_details": "Labor for the installation of the garage door system.",
    "old_taxable": false,
    "old_app_data": {},
    "new_details": "Labor for the installation of the garage door system. Labor only; physical parts are separate line items.",
    "item_type": "labor",
    "related_labor_ids": []
  },
  {
    "id": "r3km9ec3hbnq0tdiav7p",
    "name": "Opener Installation Labor",
    "old_details": "Labor for the installation of the garage door opener system.",
    "old_taxable": false,
    "old_app_data": {},
    "new_details": "Labor for the installation of the garage door opener system. Labor only; physical parts are separate line items.",
    "item_type": "labor",
    "related_labor_ids": []
  },
  {
    "id": "e6xjcu09u93wzr8au7bl",
    "name": "Additional Labor",
    "old_details": "Additional labor beyond the original scope of work, as approved.",
    "old_taxable": false,
    "old_app_data": {},
    "new_details": "Additional labor beyond the original scope of work, as approved. Labor only; physical parts are separate line items.",
    "item_type": "labor",
    "related_labor_ids": []
  },
  {
    "id": "o262dy9vk381hfyqp149",
    "name": "Programming Labor",
    "old_details": "Labor for programming of remotes, keypads, or vehicle-integrated garage door controls.",
    "old_taxable": false,
    "old_app_data": {},
    "new_details": "Labor for programming of remotes, keypads, or vehicle-integrated garage door controls. Labor only; physical parts are separate line items.",
    "item_type": "labor",
    "related_labor_ids": []
  },
  {
    "id": "rcs30e1mwpyl281bwqfj",
    "name": "Commercial Door Labor",
    "old_details": "Labor for service performed on a commercial garage door system.",
    "old_taxable": false,
    "old_app_data": {},
    "new_details": "Labor for service performed on a commercial garage door system. Labor only; physical parts are separate line items.",
    "item_type": "labor",
    "related_labor_ids": []
  },
  {
    "id": "si6jouxrcfe11nq65rbu",
    "name": "Emergency / After-Hours Service",
    "old_details": "Labor for service performed outside of standard business hours.",
    "old_taxable": false,
    "old_app_data": {},
    "new_details": "Labor for service performed outside of standard business hours. Labor only; physical parts are separate line items.",
    "item_type": "labor",
    "related_labor_ids": []
  },
  {
    "id": "de921xrg2u8uod3b3734",
    "name": "Custom Labor",
    "old_details": "Customizable labor line item — description can be edited for the specific job.",
    "old_taxable": false,
    "old_app_data": {},
    "new_details": "Customizable labor line item — description can be edited for the specific job. Labor only; physical parts are separate line items.",
    "item_type": "labor",
    "related_labor_ids": []
  }
]$catalog$::jsonb;
BEGIN
  UPDATE public.products AS p
  SET details=c.new_details,
      taxable=(c.item_type <> 'labor'),
      app_data=coalesce(p.app_data,'{}'::jsonb) || jsonb_build_object(
        'itemType',c.item_type,'relatedLaborIds',c.related_labor_ids)
  FROM jsonb_to_recordset(corrections) AS c(
    id text,name text,old_details text,old_taxable boolean,old_app_data jsonb,
    new_details text,item_type text,related_labor_ids jsonb)
  WHERE p.id=c.id AND p.name=c.name
    AND p.active IS NOT FALSE
    AND p.details IS NOT DISTINCT FROM c.old_details
    AND p.taxable IS NOT DISTINCT FROM c.old_taxable
    AND p.app_data IS NOT DISTINCT FROM c.old_app_data;
  GET DIAGNOSTICS changed = ROW_COUNT;
  IF changed <> 84 THEN
    RAISE EXCEPTION 'Catalog changed since review: expected 84 matches, got %. All changes rolled back.',changed;
  END IF;
END
$repair$;
COMMIT;
