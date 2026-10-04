from flask import Flask, render_template, jsonify, request

app = Flask(__name__)
app.config["SEND_FILE_MAX_AGE_DEFAULT"] = 0  # always load the latest JS/CSS

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/api/path", methods=["POST"])
def path_api():
    # The browser performs the graph algorithms so the system stays simple.
    return jsonify({"ok": True})

if __name__ == "__main__":
    app.run(debug=True)
