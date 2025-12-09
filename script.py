import xml.etree.ElementTree as ET
import json

# Chemins
xmi_file = "uml.xmi"
mdj_file = "export_staruml.mdj"

# Namespace XMI et UML
ns = {
    "xmi": "http://www.omg.org/XMI",
    "uml": "href://org.omg/UML/1.3"
}

# Lire le XMI
tree = ET.parse(xmi_file)
root = tree.getroot()

# Liste pour stocker les classes
elements = []

# Trouver toutes les classes/interfaces
for uml_class in root.findall(".//uml:Class", ns):
    class_name = uml_class.get("name")
    is_interface = uml_class.get("isInterface") == "true"

    # Attributs
    attributes = []
    features = uml_class.find("uml:Classifier.feature", ns)
    if features is not None:
        for attr in features.findall("uml:Attribute", ns):
            attr_name = attr.get("name")
            visibility = attr.get("visibility", "public")
            attributes.append({
                "name": attr_name,
                "visibility": visibility,
                "type": "string"  # par défaut
            })

    elements.append({
        "_id": uml_class.get("{http://www.omg.org/XMI}id"),
        "_type": "UMLClass",
        "name": class_name,
        "isInterface": is_interface,
        "ownedElements": [],
        "attributes": attributes
    })

# Construire le modèle StarUML minimal
staruml_model = {
    "_type": "Project",
    "name": "ImportPlantUML",
    "ownedElements": [
        {
            "_type": "Model",
            "name": "ImportedModel",
            "ownedElements": elements
        }
    ]
}

# Écrire en JSON
with open(mdj_file, "w", encoding="utf-8") as f:
    json.dump(staruml_model, f, indent=2, ensure_ascii=False)

print(f"Fichier .mdj généré : {mdj_file}")
