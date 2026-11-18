## Référence cartographique — Angoulême

La carte de *DeadLine* reprend la géographie générale d’Angoulême en la condensant pour le jeu. **Les Forges** s’inspirent du secteur gare–L’Houmeau et de l’héritage industriel de la ville basse. **La Dalle** occupe le coteau, avec des passages piétons entre les niveaux. **Le Nœud** domine la ville depuis un plateau bordé de remparts, réaménagé en centre administratif.

### Les Forges dans « Puce fantôme »

- **Garage de Mina.** Installer le garage dans une rue d’ateliers qui débouche sur l’avenue. Depuis le garage, le joueur voit où prendre la voiture et où couper à pied vers le dépôt.
- **Dépôt.** Placer un ancien bâtiment industriel reconverti en centre logistique le long des voies. Son entrée principale donne sur l’avenue. La cour de livraison s’atteint par une ruelle en pente.
- **Fuite en voiture.** L’avenue longe les voies avant de les franchir par un pont routier. Le détour est plus long, mais la voiture permet de prendre rapidement de la distance.
- **Fuite à pied.** Un escalier et un passage sous les voies mènent directement au point de remise. Le tablier s’efface à l’écran quand il masque le joueur.
- **Retour en ville libre.** Après la livraison, Mina ouvre une grille de service entre le passage inférieur et la rue des ateliers. Le raccourci reste accessible lorsqu’on revient dans le quartier.

### Modification du premier jalon web

Construire **un îlot fictif avec deux niveaux** dans Three.js et Rapier. Poser le garage, la cour du dépôt, l’avenue, le pont et le passage inférieur en blocs gris. Tester les deux fuites depuis la cour jusqu’au point de remise avant d’étendre la carte à quatre pâtés de maisons.

Le jalon est validé quand le joueur comprend au premier passage quelle route est carrossable, repère l’escalier à pied et distingue le pont du passage inférieur avec la caméra fixe. La position de la voiture doit influencer son choix de sortie.