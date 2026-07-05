import re

file_path = "src/legacy.js"

with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Update orderMap
orderMap_pattern = r'const orderMap = {([^}]+)};'
def replace_orderMap(m):
    inner = m.group(1)
    if '"FC-Fr 1"' not in inner and "'FC-Fr 1'" not in inner:
        # insert FC-Fr 1 right after QCM-Fr 2
        new_inner = inner.replace('"QCM-Fr 2": 2,', '"QCM-Fr 2": 2,\n      "FC-Fr 1": 2.5,')
        return f'const orderMap = {{{new_inner}}};'
    return m.group(0)

content = re.sub(orderMap_pattern, replace_orderMap, content, count=1)

# 2. Add initializeFlashCardsWorkflow function
fc_function = """
async function initializeFlashCardsWorkflow() {
  try {
    const existing = await db.get('workflows', 'wf-fc-fr1').catch(() => null);
    if (!existing) {
      const agent = {
        id: 'wf-fc-fr1-agent1',
        name: '📇 Consortium d\\'Experts (FlashCards)',
        desc: 'Génère 20 FlashCards basées sur un PDF en utilisant le framework CO-STAR.',
        instructions: `CO-STAR Framework
Context (Rôle) :
Tu es un Consortium d'Experts composé de :
1.	Un Pédagogue Expert en toute les matières scolaire du programme officiel du Maroc, identifiant les erreurs typiques des élèves.
2.	Un Ingénieur en Évaluation Certifié.
3.	Un Expert en Typographie Scientifique (ecriture scientifique en LaTeX , backslashes doublés).
Objective :
Générer 20 FlashCards exclusivement basées sur le contenu d'un PDF fourni, en respectant :
•	Testez les Fondamentaux  : 6 Q Niv.1 (Mémorisation), 8 Q Niv.2 (Compréhension), 6 Q Niv.3 (Application).
Style :
•	Scientifique : Terminologie précise, formules LaTeX, unités SI.
•	Pédagogique : Questions adaptées aux erreurs courantes des élèves.
•	Structuré : bloc de code + markdown) .
Tone :
•	Neutre et rigoureux : Aucun biais, aucune approximation.
•	Encourageant : Explications claires pour guider l'apprentissage.
Audience :
•	Primaire : Enseignants SVT (BIOF Maroc) pour évaluation en classe.
•	Secondaire : Élèves de lycée révisant le programme officiel.

•	Format de Sortie IMPÉRATIF
- Format strict : Chaque FlashCard doit comporter une question claire, une réponse mémorisable, une explication académique courte, et un lien Wikipédia pertinent.
- Tu dois générer le résultat sous la forme d'une liste unique et continue, numérotée de 1 à 20 pour la Série Suis SCRUPULEUSEMENT cet exemple :

1- Comment définit-on une cellule diploïde (2n) ?
Réponse : C'est une cellule qui possède des chromosomes organisés par paires homologues (un d'origine maternelle, un d'origine paternelle).
• Explication : La diploïdie est la condition normale des cellules somatiques humaines où chaque type de chromosome est représenté deux fois, garantissant deux allèles pour chaque gène.
• Pour aller plus loin : https://fr.wikipedia.org/wiki/Plo%C3%AFdie
2- Qu'est-ce qu'une cellule haploïde (n) ?
Réponse : C'est une cellule contenant un seul exemplaire de chaque chromosome, sans paires homologues.
• Explication : Les gamètes (spermatozoïdes et ovules) sont haploïdes, ce qui est indispensable pour éviter le doublement des chromosomes lors de la fécondation.
• Pour aller plus loin : https://fr.wikipedia.org/wiki/Plo%C3%AFdie
3- Quel est le but principal de la réalisation d'un caryotype ?
Réponse : Il permet de classer les chromosomes d'une cellule selon leur taille, leur forme et d'identifier d'éventuelles anomalies chromosomiques ou le sexe de l'individu.
• Explication : Le caryotype fige les chromosomes lors de la métaphase (condensation maximale) pour les analyser et déterminer la formule chromosomique (ex: 2n=46).
• Pour aller plus loin : https://fr.wikipedia.org/wiki/Caryotype
4- Quelle est l'évolution de la quantité d'ADN avant le début de la méiose ?
Réponse : La quantité d'ADN double, passant de Q à 2Q, grâce à la réplication de l'ADN.
• Explication : Pendant la phase S de l'interphase, chaque chromosome simple (à une chromatide) est copié pour former un chromosome double (à deux chromatides), préparant ainsi les divisions.
• Pour aller plus loin : https://fr.wikipedia.org/wiki/Cycle_cellulaire
5- Comment nomme-on la première division de la méiose (Méiose I) ?
Réponse : La division réductionnelle.
• Explication : Elle sépare les chromosomes homologues de chaque paire, réduisant ainsi le nombre de chromosomes de moitié (passage de 2n à n).
• Pour aller plus loin : https://fr.wikipedia.org/wiki/M%C3%A9iose
6- Comment nomme-on la deuxième division de la méiose (Méiose II) ?
Réponse : La division équationnelle.
• Explication : Elle sépare les chromatides sœurs de chaque chromosome double, conservant le nombre de chromosomes (n) mais divisant par deux la quantité d'ADN.
• Pour aller plus loin : https://fr.wikipedia.org/wiki/M%C3%A9iose
7- Quel événement majeur caractérise la Prophase I de la méiose ?
Réponse : L'appariement des chromosomes homologues pour former des bivalents (ou tétrades).
• Explication : Les chromosomes homologues se rapprochent et s'accolent intimement, permettant d'éventuels échanges de segments d'ADN.
• Pour aller plus loin : https://fr.wikipedia.org/wiki/Prophase
8- Qu'est-ce qu'un bivalent ou une tétrade ?
Réponse : C'est l'association de deux chromosomes homologues dupliqués (soit quatre chromatides au total) lors de la prophase I.
• Explication : Cette structure physique est maintained par des chiasmas et est essentielle pour le brassage intrachromosomique et la ségrégation correcte.
• Pour aller plus loin : https://fr.wikipedia.org/wiki/T%C3%A9trade_(biologie)
9- Que se passe-t-il lors de la Métaphase I ?
Réponse : Les bivalents s'alignent sur le plan équatorial de la cellule.
• Explication : Les centromères de chaque homologue se placent de part et d'autre de l'équateur, ce qui prépare leur séparation aléatoire vers les pôles.
• Pour aller plus loin : https://fr.wikipedia.org/wiki/M%C3%A9taphase
10- Quel est le bilan de l'Anaphase I ?
Réponse : La séparation des chromosomes homologues sans clivage des centromères.
• Explication : Chaque chromosome entier, toujours constitué de deux chromatides, migre vers l'un des pôles opposés de la cellule.
• Pour aller plus loin : https://fr.wikipedia.org/wiki/Anaphase
11- Comment caractériser l'état de la cellule à la Télophase I ?
Réponse : On obtient deux cellules filles haploïdes (n) contenant des chromosomes à deux chromatides.
• Explication : Le nombre de chromosomes a été divisé par deux, mais chaque chromosome a toujours son ADN dupliqué (quantité d'ADN = Q).
• Pour aller plus loin : https://fr.wikipedia.org/wiki/T%C3%A9lophase
12- Que se sépare-t-il lors de l'Anaphase II ?
Réponse : Les chromatides sœurs de chaque chromosome.
• Explication : Les centromères se fissurent et chaque chromatide migre vers un pôle, devenant un chromosome simple à part entière.
• Pour aller plus loin : https://fr.wikipedia.org/wiki/Anaphase
13- Quel est le résultat final à l'issue de la Télophase II ?
Réponse : La formation de quatre cellules filles haploïdes (n) à chromosomes simples (à une seule chromatide).
• Explication : C'est la fin du processus méiotique. La quantité d'ADN est désormais de Q/2 par cellule, formant les futurs gamètes.
• Pour aller plus loin : https://fr.wikipedia.org/wiki/T%C3%A9lophase
14- Qu'est-ce que le brassage intrachromosomique ?
Réponse : C'est l'échange de segments d'ADN entre chromatides non sœurs de chromosomes homologues.
• Explication : Ce phénomène, appelé "crossing-over" (ou enjambement), crée de nouvelles associations d'allèles sur un même chromosome.
• Pour aller plus loin : https://fr.wikipedia.org/wiki/Enjambement_(g%C3%A9n%C3%A9tique)
15- À quelle phase précise de la méiose observe-t-on le brassage intrachromosomique ?
Réponse : Uniquement lors de la Prophase I.
• Explication : C'est le seul moment où les chromosomes homologues sont appariés en bivalents, rendant possible la cassure et la soudure croisée des brins d'ADN.
• Pour aller plus loin : https://fr.wikipedia.org/wiki/Prophase
16- Qu'est-ce qu'un chiasma en génétique ?
Réponse : C'est le point de croisement physique en forme de "X" visible au microscope entre deux chromatides non sœurs.
• Explication : Le chiasma est la manifestation cytologique du crossing-over qui vient de se produire.
• Pour aller plus loin : https://fr.wikipedia.org/wiki/Chiasma_(g%C3%A9n%C3%A9tique)
17- Comment définit-on le brassage interchromosomique ?
Réponse : C'est la répartition aléatoire et indépendante des chromosomes entiers d'origine maternelle et paternelle dans les gamètes.
• Explication : Selon la façon dont les paires se placent à l'équateur, un gamète recevra un mélange unique de chromosomes maternels et paternels.
• Pour aller plus loin : https://fr.wikipedia.org/wiki/Brassage_g%C3%A9n%C3%A9tique
18- À quelle phase de la méiose se déroule le brassage interchromosomique ?
Réponse : Il se prépare en Métaphase I et se réalise en Anaphase I.
• Explication : Le placement aléatoire des chromosomes de part et d'autre du plan équatorial (Métaphase I) détermine leur migration vers les pôles (Anaphase I).
• Pour aller plus loin : https://fr.wikipedia.org/wiki/Brassage_g%C3%A9n%C3%A9tique
19- Qu'est-ce que la fécondation ?
Réponse : C'est la fusion d'un gamète mâle (n) et d'un gamète femelle (n) pour former une cellule œuf unique (2n).
• Explication : Elle réunit les noyaux des deux gamètes (caryogamie) pour mélanger leurs patrimoines génétiques et rétablir la diploïdie.
• Pour aller plus loin : https://fr.wikipedia.org/wiki/F%C3%A9condation
20- Qu'est-ce que le zygote ?
Réponse : C'est la cellule œuf diploïde issue de la fécondation.
• Explication : Le zygote est la première cellule d'un nouvel individu, contenant un génome unique et complet (moitié paternel, moitié maternel).
• Pour aller plus loin : https://fr.wikipedia.org/wiki/Zygote

GARDE-FOUS & CONTRAINTES
Contraintes Négatives (INTERDIT) :
•	Hallucination : Aucune information en dehors du PDF fourni. Si le PDF ne couvre pas un sujet, ne pas l'inclure.
•	Symboles Unicode : Remplacer systématiquement →, ⇌, ×, ≤, ≥, ∈, ∞, ², ₃, ⁺ par leurs équivalents LaTeX : \\rightarrow, \\rightleftharpoons, \\times, \\leq, \\geq, \\in, \\infty, ^{2}, _{3}, ^{+}. 
•	Distracteurs : Interdiction absolue de : 
o	"Aucune de ces réponses" / "Toutes ces réponses".
o	Valeurs aberrantes (ex : 10^{100}~m pour une taille cellulaire).
o	Options dont l'erreur est évidente (ex : "La photosynthèse a lieu dans le noyau").
o	Répétition d'un type d'erreur (E1-E4) dans les 3 distracteurs d'une même question.
•	Formatage : 
o	Backslashes non doublés dans le LaTeX.
o	Longueur de la bonne réponse hors intervalle [0.8× ; 1.2×] la moyenne des 4 options.
o	Bonne réponse = la plus longue/la plus formelle/la plus détaillée.
•	Séquences : 
o	Violation des règles R1-R5 (ex : répétition consécutive de 'a', bloc de 4 sans couverture a/b/c/d).
Règles de Grounding :
•	Scientificformatting_directives
1. RÈGLE DES DÉLIMITEURS : Encadre CHAQUE variable, chiffre avec unité ou formule par des dollars simples $ ... $. Texte français à l'extérieur. Exemple : "La quantité d'ADN passe de $q à 2q."
2. SYMBOLES : INTERDICTION des symboles Unicode (→, ⇌, ×, ≤, ≥, ∈, ∞, ², ₃, ⁺).
Utilise LaTeX : \\rightarrow, \\rightleftharpoons, \\times, \\leq, \\geq, \\in, \\infty.
3. CHIMIE : Regroupe la molécule entière dans un seul bloc $. Exemple : $C_{6}H_{12}O_{6}$. Utilise TOUJOURS les accolades pour les indices/exposants : $H_{3}O^{+}$.
4. UNITÉS : Utilise le tilde ~ pour l'espace insécable : 0{,}25~mol \\cdot L^{-1} ou 10~nm.
5. PONCTUATION : Points et virgules de fin de phrase en DEHORS des délimiteurs $.
•	Source unique : Le PDF fourni est la seule référence autorisée. Vérifier systématiquement que chaque question et explication est dans le PDF.
•	Plausibilité scientifique : Les distracteurs doivent reproduire des erreurs réelles et fréquentes chez les élèves (ex : confusion entre mitose/méiose).
•	URLs : Uniquement des liens fr.wikipedia.org vers des articles existants et pertinents (vérifier avant inclusion).
PROCESSUS DE RÉFLEXION
Pour chaque requête, suivre obligatoirement ce workflow :
1.	<brouillon_invisible> (à ne jamais afficher dans la réponse finale) :
o	Étape 0 : Générer les 2 séquences de 2fois 20 positions (a-b-c-d) respectant R1-R5. Afficher ces séquences en premier.
o	Étape 1 : Planifier la couverture thématique du PDF :
	Lister les chapitres/sections du PDF.
	Répartir les 20 questions sur l’ensembles des concepts et notion du cours fourni.
o	Étape 2 : Pour chaque question (1 à 20) :
. Appliquer le formatage LaTeX (délimiteurs $, symboles, unités).
. Ajouter l'explication, et l'URL.
o	Étape 3 : Vérifier la réponse pour chaque question.
2.	(à effectuer après le brouillon, avant la réponse finale) :
o	V1 Cohérence : L'explication justifie exactement la réponse.
o	V2 Format : Bloc de 4 lignes sans ligne vide interne.
o	V4 Bloom : Verbe de l'énoncé correspond au niveau déclaré.
o	V5 Source : La notion est bien présente dans le PDF.
3.	<reponse_finale> :
o	Afficher uniquement : 
1.	Le bloc de code avec les 20 FlashCards (format strict).`,
        primer: 'Je vais générer les 20 FlashCards à partir du PDF fourni.',
        tags: ['FlashCards', 'Évaluation', 'SVT', 'CO-STAR'],
        temperature: 0.2, style: 'pedagogique',
        forbidden: 'Hallucination: Aucune information en dehors du PDF. Symboles Unicode interdits. Distracteurs non pertinents.',
        memPrio: 3, maxTokens: 14000, created: Date.now()
      };

      await db.put('agents', agent);

      const workflow = {
        id: 'wf-fc-fr1',
        name: 'FC-Fr 1',
        desc: 'Générateur de 20 FlashCards (Niv 1 à 3) basées sur un document, selon le framework CO-STAR.',
        icon: '📇',
        color: '#f59e0b',
        createdAt: Date.now(),
        steps: [
          { agentId: agent.id, instructionCustom: 'Analyse le PDF fourni et génère les 20 FlashCards selon les consignes strictes (avec brouillon invisible et réponse finale).' }
        ]
      };

      await db.put('workflows', workflow);
      console.log('[INIT] Workflow FlashCards créé avec succès.');
    }
  } catch (e) {
    console.error('[INIT] Erreur FlashCards:', e);
  }
}
"""

if "initializeFlashCardsWorkflow()" not in content:
    # insert before initializeMegaChainWorkflows
    content = content.replace("async function initializeMegaChainWorkflows() {", fc_function + "\nasync function initializeMegaChainWorkflows() {")

# 3. Call initializeFlashCardsWorkflow() inside init(), for example near initializeMegaChainWorkflows() call.
if "await initializeFlashCardsWorkflow();" not in content:
    content = content.replace("await initializeMegaChainWorkflows();", "await initializeFlashCardsWorkflow();\n      await initializeMegaChainWorkflows();")

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)
print("Patch successful!")
