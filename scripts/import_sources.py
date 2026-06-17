#!/usr/bin/env python3
"""
Import curated sources from JSON file into the database.
"""
import json
import sys
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from argos.database import DatabaseManager
from argos.config import settings

def import_sources():
    """Import sources from data/curated_sources.json into database"""
    
    # Load JSON file
    json_path = Path(__file__).parent.parent / "data" / "curated_sources.json"
    
    if not json_path.exists():
        print(f"❌ File not found: {json_path}")
        return
    
    with open(json_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    sources = data.get('sources', [])
    
    if not sources:
        print("❌ No sources found in JSON file")
        return
    
    print(f"📚 Found {len(sources)} sources to import")
    
    # Connect to database
    db_manager = DatabaseManager(str(settings.database_url))
    
    with db_manager.get_connection() as conn:
        cursor = conn.cursor()
        
        # Check existing sources count
        cursor.execute("SELECT COUNT(*) FROM sources")
        existing_count = cursor.fetchone()[0]
        
        if existing_count > 0:
            print(f"⚠️  Database already has {existing_count} sources")
            response = input("Do you want to add more sources? (y/n): ")
            if response.lower() != 'y':
                print("❌ Import cancelled")
                return
        
        # Insert sources
        inserted = 0
        skipped = 0
        
        for source in sources:
            try:
                cursor.execute("""
                    INSERT INTO sources (name, url, type, category, description, tags, active)
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (url) DO NOTHING
                    RETURNING id
                """, (
                    source['name'],
                    source['url'],
                    source['type'],
                    source['category'],
                    source['description'],
                    source['tags'],
                    source['active']
                ))
                
                if cursor.fetchone():
                    inserted += 1
                    print(f"✅ Imported: {source['name']} ({source['type']})")
                else:
                    skipped += 1
                    print(f"⏭️  Skipped (duplicate): {source['name']}")
                    
            except Exception as e:
                print(f"❌ Error importing {source['name']}: {e}")
                skipped += 1
        
        print("\n" + "="*60)
        print(f"✅ Import complete!")
        print(f"   Inserted: {inserted}")
        print(f"   Skipped:  {skipped}")
        print(f"   Total:    {inserted + skipped}")
        print("="*60)

if __name__ == "__main__":
    import_sources()
