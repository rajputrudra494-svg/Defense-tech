-- ============================================================
-- DUMMY SEED DATA FOR FIELDVAULT LEDGER
-- Run this in the Supabase SQL Editor AFTER running the setup script!
-- ============================================================

DO $$ 
DECLARE
  first_user_id UUID;
BEGIN
  -- Get the first user profile to act as the "Creator" of the assets
  SELECT id INTO first_user_id FROM public.profiles LIMIT 1;

  -- Verify we found a user first
  IF first_user_id IS NOT NULL THEN
    
    -- Insert a bunch of diverse dummy assets
    INSERT INTO public.assets (name, type, serial_number, status, location, notes, created_by) VALUES
    ('DJI Mavic 3 Enterprise', 'drone', 'DRN-M3E-001', 'available', 'Armory Locker 1', 'Standard reconnaissance drone with thermal imaging.', first_user_id),
    ('DJI Matrice 300 RTK', 'drone', 'DRN-M300-882', 'available', 'Armory Locker 2', 'Heavy lift and extended range, missing spare battery.', first_user_id),
    ('Skydio X2D', 'drone', 'DRN-SKD-404', 'checked_out', 'Field', 'Thermal payload attached. Currently deployed in Sector Alpha.', first_user_id),
    ('AeroVironment Puma 3 AE', 'drone', 'DRN-PUM-991', 'maintenance', 'Repair Bay', 'Rotor replacement required.', first_user_id),
    
    ('L3Harris Falcon III AN/PRC-152A', 'radio', 'RAD-152-A12', 'available', 'Comms Depot', 'VHF/UHF Handheld.', first_user_id),
    ('Motorola APX 8000', 'radio', 'RAD-APX-800', 'maintenance', 'Repair Bay', 'Screen cracked, pending replacement from log-supply.', first_user_id),
    ('Thales AN/PRC-148 JEM', 'radio', 'RAD-148-B55', 'available', 'Comms Depot', 'Fully charged.', first_user_id),
    
    ('Oshkosh JLTV', 'vehicle', 'VEH-JLT-109', 'checked_out', 'Sector Bravo', 'Routine border patrol.', first_user_id),
    ('Polaris MRZR', 'vehicle', 'VEH-MRZ-44', 'available', 'Motor Pool', 'Fueled and ready for deployment.', first_user_id),
    ('HMMWV M1114', 'vehicle', 'VEH-HMM-212', 'maintenance', 'Motor Pool Bay 2', 'Oil leak in front right axle.', first_user_id),
    
    ('M4A1 Carbine', 'weapon', 'WPN-M4-5552', 'available', 'Armory Rack 1A', 'Equipped with ACOG optic and foregrip.', first_user_id),
    ('SIG Sauer M17', 'weapon', 'WPN-M17-909', 'available', 'Armory Locker 4', 'Standard 9mm sidearm.', first_user_id),
    ('M240B Machine Gun', 'weapon', 'WPN-M240-302', 'maintenance', 'Armory Workbench', 'Scheduled barrel replacement.', first_user_id),
    ('M110 Semi-Automatic Sniper System', 'weapon', 'WPN-SASS-001', 'checked_out', 'Field', 'Camouflage wrap applied.', first_user_id),
    
    ('AN/PVS-31A Night Vision', 'optics', 'OPT-PVS-31', 'checked_out', 'Field', 'White phosphor dual tubes.', first_user_id),
    ('Trijicon ACOG 4x32', 'optics', 'OPT-ACG-432', 'available', 'Armory Locker 3', 'Rifle optic.', first_user_id),
    ('Vortex Razor HD Gen III', 'optics', 'OPT-VRZ-10', 'available', 'Armory Locker 3', 'Variable zoom sniper scope.', first_user_id),
    
    ('IFAK Level 2 Kit', 'medical', 'MED-IF-201', 'available', 'Medical Supply', 'Full trauma kit, replenished last week.', first_user_id),
    ('DefibTech Lifeline AED', 'medical', 'MED-AED-001', 'available', 'Medical Supply', 'Battery replaced last month.', first_user_id),
    ('Combat Application Tourniquet', 'medical', 'MED-CAT-509', 'available', 'Medical Supply', 'Sealed.', first_user_id),
    
    ('Starlink Roam Kit', 'comms', 'COM-STLK-55', 'checked_out', 'FOB Bravo', 'Mobile internet terminal. Current uplink active.', first_user_id),
    ('Portable Generator 5000W', 'other', 'OTH-GEN-01', 'available', 'Supply Depot', 'Honda inverter generator.', first_user_id);
    
    -- Insert tracking logs for these newly seeded assets
    INSERT INTO public.custody_logs (asset_id, action, performed_by, location, notes)
    SELECT id, 'registered', first_user_id, location, 'Initial seeded equipment record'
    FROM public.assets
    WHERE notes LIKE '%';
    
  END IF;
END $$;
