
.PHONY: layer1 
layer1:
	uv run python layer1/app.py

.PHONY: layer2
layer2:
	uv run python layer2/app.py


.PHONY: layer3
layer3:
	uv run python layer3/app.py

.PHONY: layer4
layer4:
	uv run python layer4/app.py

.PHONY: layer5
layer5:
	uv run python layer5/app.py

.PHONY: layer6
layer6:
	uv run python layer6/app.py
