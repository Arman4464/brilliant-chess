import json
import numpy as np

ground_truth = [
  { 'id': '184653017586', 'wAcc': 60.33767, 'bAcc': 70.07238 },
  { 'id': '171608609212', 'wAcc': 74.71615, 'bAcc': 86.32944 },
  { 'id': '114104460147', 'wAcc': 70.49229, 'bAcc': 74.51587 },
  { 'id': '172014464516', 'wAcc': 87.08492, 'bAcc': 81.65651 },
  { 'id': '171853838612', 'wAcc': 83.87660, 'bAcc': 76.49061 },
  { 'id': '165803154362', 'wAcc': 66.21340, 'bAcc': 75.25288 },
  { 'id': '184348301442', 'wAcc': 63.0, 'bAcc': 75.3 }
]

classes = ['brilliant', 'great_find', 'best', 'excellent', 'good', 'book', 'forced', 'inaccuracy', 'mistake', 'incorrect', 'blunder']

X = []
y = []

for gt in ground_truth:
    gid = gt['id']
    f = f'review_data/live_browser_reviews/review_{gid}.json'
    with open(f, 'r') as fp:
        data = json.load(fp)
    
    for color, target in [('white', gt['wAcc']), ('black', gt['bAcc'])]:
        moves = [m for m in data['moves'] if (m['ply'] % 2 == 1 if color == 'white' else m['ply'] % 2 == 0)]
        counts = {}
        for m in moves:
            cls = m['classification'].lower().replace(' ', '_')
            counts[cls] = counts.get(cls, 0) + 1
        
        total = len(moves)
        row = [counts.get(c, 0) / total for c in classes]
        X.append(row)
        y.append(target)

X = np.array(X)
y = np.array(y)

weights, residuals, rank, s = np.linalg.lstsq(X, y, rcond=None)

preds = X @ weights
errors = np.abs(preds - y)

print('Direct Move Classification Weights:')
for c, w in zip(classes, weights):
    print(f'  {c:12s}: {w:6.2f}')

print('\nPredictions vs Actual:')
for i, (pred, actual) in enumerate(zip(preds, y)):
    gid = ground_truth[i // 2]['id']
    color = 'White' if i % 2 == 0 else 'Black'
    print(f'  Game {gid} {color:5s}: Pred={pred:5.2f}%, Actual={actual:5.2f}%, Diff={pred-actual:+5.2f}%')

print(f'\nMean Absolute Error: {np.mean(errors):.3f}%')
print(f'Max Absolute Error:  {np.max(errors):.3f}%')

model_out = {
    'classes': classes,
    'weights': {c: round(float(w), 4) for c, w in zip(classes, weights)}
}
with open('caps2_accuracy_model.json', 'w') as fp:
    json.dump(model_out, fp, indent=2)
print('\nSaved high-accuracy direct model to caps2_accuracy_model.json!')
